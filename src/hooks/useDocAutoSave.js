'use client'

import { useEffect, useRef, useState } from 'react'
import useUIStore from '@/store/useUIStore'
import useSketchStore from '@/store/useSketchStore'
import useAuthStore, { WORKER_URL } from '@/store/useAuthStore'
import { getSessionID } from '@/hooks/useSessionID'
import { encrypt, decrypt, generateKey } from '@/utils/encryption'
import { useProfileStore } from '@/hooks/useGuestProfile'

const LOCAL_KEY_PREFIX = 'lixsketch-doc-autosave'
const LOCAL_META_PREFIX = 'lixsketch-doc-autosave-meta'

const KEYSTROKE_DEBOUNCE_MS = 250          // localStorage write debounce
const CLOUD_INTERVAL_MS = 30_000           // periodic cloud sync
const CLOUD_DEBOUNCE_MS = 1_500            // cloud sync after typing pause
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 4
const MAX_DOC_BYTES = 5_000_000

function localKey() {
  const sid = typeof window !== 'undefined' ? window.__sessionID : null
  return sid ? `${LOCAL_KEY_PREFIX}-${sid}` : LOCAL_KEY_PREFIX
}
function metaKey() {
  const sid = typeof window !== 'undefined' ? window.__sessionID : null
  return sid ? `${LOCAL_META_PREFIX}-${sid}` : LOCAL_META_PREFIX
}

// Stable per-tab client identity for optimistic-concurrency conflict detection.
function getClientId() {
  if (typeof window === 'undefined') return null
  if (!window.__lixDocClientId) {
    window.__lixDocClientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }
  return window.__lixDocClientId
}

// ── Module-level state (per tab) ────────────────────────────────
let _pendingBlocks = null
let _dirty = false
let _lastSeenUpdatedAt = null              // server timestamp of last successful sync
let _localWriteTimer = null
let _cloudDebounceTimer = null
const _dbSaveTimestamps = []

export function discardPendingDocChanges() {
  if (_localWriteTimer) clearTimeout(_localWriteTimer)
  if (_cloudDebounceTimer) clearTimeout(_cloudDebounceTimer)
  _localWriteTimer = null
  _cloudDebounceTimer = null
  _pendingBlocks = null
  _dirty = false
}

function isRateLimited() {
  const now = Date.now()
  while (_dbSaveTimestamps.length && now - _dbSaveTimestamps[0] > RATE_LIMIT_WINDOW) {
    _dbSaveTimestamps.shift()
  }
  return _dbSaveTimestamps.length >= RATE_LIMIT_MAX
}
function recordDbSave() {
  _dbSaveTimestamps.push(Date.now())
}

function callerIdFromState() {
  const auth = useAuthStore.getState()
  if (auth.isAuthenticated) return auth.user?.id || 'anonymous'
  return useProfileStore.getState().profile?.id ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('lixsketch-guest-session') : null) ||
    'anonymous'
}

function writeLocalNow() {
  if (!_pendingBlocks || typeof window === 'undefined') return
  try {
    localStorage.setItem(localKey(), JSON.stringify({
      blocks: _pendingBlocks,
      savedAt: Date.now(),
    }))
    localStorage.setItem(metaKey(), JSON.stringify({
      lastSeenUpdatedAt: _lastSeenUpdatedAt,
      clientId: getClientId(),
    }))
  } catch {}
}

/**
 * Called from the editor's onChange. Stores blocks in module state and
 * schedules a debounced localStorage write + a debounced cloud sync.
 * Pure synchronous work — does not stringify on the hot path.
 */
export function triggerDocSync(blocks) {
  _pendingBlocks = blocks
  _dirty = true

  // Debounce localStorage write so we don't serialize a giant doc
  // every keystroke.
  clearTimeout(_localWriteTimer)
  _localWriteTimer = setTimeout(writeLocalNow, KEYSTROKE_DEBOUNCE_MS)

  // Schedule a cloud sync after a longer pause; the periodic interval
  // is still the primary persistence mechanism.
  clearTimeout(_cloudDebounceTimer)
  _cloudDebounceTimer = setTimeout(() => { syncToCloud().catch(() => {}) }, CLOUD_DEBOUNCE_MS)
}

/**
 * Pushes the buffered doc to D1. Reuses the scene's per-session
 * encryption key — bails if it isn't available yet (scene autosave will
 * lay it down first; this hook waits via `keyReady` in the React layer).
 */
async function syncToCloud() {
  if (!WORKER_URL || !_dirty || !_pendingBlocks) return false
  if (isRateLimited()) {
    console.log('[DocAutoSave] rate limited, skipping')
    return false
  }

  const sessionId = getSessionID()
  if (!sessionId) return false

  // CRITICAL: never mint a fresh key here. If scene hasn't published its
  // key, defer — minting a different one would silently encrypt the doc
  // with a key that diverges from the scene's, making it unrecoverable.
  const encKey = useUIStore.getState().loadEncryptionKeyForSession?.(sessionId)
  if (!encKey) {
    console.log('[DocAutoSave] scene key not ready yet — deferring cloud sync')
    return false
  }

  // Snapshot current pending content so the sync isn't fighting in-flight
  // edits.
  const blocksAtSyncStart = _pendingBlocks
  const json = JSON.stringify(blocksAtSyncStart)
  if (new Blob([json]).size > MAX_DOC_BYTES) {
    console.warn('[DocAutoSave] doc exceeds size limit; refusing to upload')
    return false
  }

  try {
    const encryptedData = await encrypt(json, encKey)
    const res = await fetch(`${WORKER_URL}/api/canvas-docs/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        encryptedData,
        createdBy: callerIdFromState(),
        clientId: getClientId(),
        lastSeenUpdatedAt: _lastSeenUpdatedAt,
      }),
    })

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      if (data.updatedAt) _lastSeenUpdatedAt = data.updatedAt
      // Only clear dirty flag if no further edits arrived during the request.
      if (_pendingBlocks === blocksAtSyncStart) _dirty = false
      recordDbSave()
      return true
    }

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}))
      console.warn('[DocAutoSave] conflict — another client wrote a newer version', data)
      _lastSeenUpdatedAt = data.serverUpdatedAt || _lastSeenUpdatedAt
      // Don't clear dirty — operator decides whether to overwrite.
      return false
    }

    if (res.status === 413) {
      console.warn('[DocAutoSave] doc too large')
      return false
    }

    console.warn('[DocAutoSave] cloud save failed:', res.status)
    return false
  } catch (err) {
    console.warn('[DocAutoSave] cloud sync error:', err)
    return false
  }
}

/**
 * Force a cloud flush. Called from Ctrl+S and from the unified
 * triggerCloudSync in useAutoSave so scene + doc save together.
 */
export async function triggerDocCloudSync() {
  // Flush any pending localStorage debounce first.
  if (_localWriteTimer) {
    clearTimeout(_localWriteTimer)
    _localWriteTimer = null
    writeLocalNow()
  }
  if (_cloudDebounceTimer) {
    clearTimeout(_cloudDebounceTimer)
    _cloudDebounceTimer = null
  }
  return syncToCloud()
}

export async function persistLayoutMode(layoutMode) {
  if (!WORKER_URL) return
  try {
    const sessionId = getSessionID()
    if (!sessionId) return
    await fetch(`${WORKER_URL}/api/canvas-docs/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, layoutMode, createdBy: callerIdFromState() }),
    })
  } catch {}
}

/**
 * Hydrates the editor: cloud → localStorage → empty.
 * Holds the editor mount until hydrated so we never submit a default
 * empty doc to a session that already has saved content.
 */
export default function useDocAutoSave(active) {
  const setLayoutMode = useSketchStore((s) => s.setLayoutMode)
  const [initialContent, setInitialContent] = useState(undefined)
  const [ready, setReady] = useState(false)

  // Hydrate once on first activation.
  useEffect(() => {
    if (!active || ready) return
    let cancelled = false

    const hydrate = async () => {
      const sessionId = getSessionID()

      // 1. Local first (instant if present).
      try {
        const raw = localStorage.getItem(localKey())
        const meta = localStorage.getItem(metaKey())
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.blocks && !cancelled) setInitialContent(parsed.blocks)
        }
        if (meta) {
          const m = JSON.parse(meta)
          if (m?.lastSeenUpdatedAt) _lastSeenUpdatedAt = m.lastSeenUpdatedAt
        }
      } catch {}

      // 2. Cloud (authoritative). Pass callerId so the worker can auth.
      if (WORKER_URL && sessionId) {
        try {
          const url = `${WORKER_URL}/api/canvas-docs/load?sessionId=${sessionId}&callerId=${encodeURIComponent(callerIdFromState())}`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json()
            if (data.layoutMode) {
              const current = useSketchStore.getState().layoutMode
              if (current === 'canvas' && data.layoutMode !== 'canvas') {
                setLayoutMode(data.layoutMode)
              }
            }
            if (data.updatedAt) _lastSeenUpdatedAt = data.updatedAt
            if (data.encryptedData) {
              // Wait up to ~10s for the scene's per-session key to appear.
              // Scene autosave loads it during its own hydration pass; we
              // must NOT mount the editor with empty content until then,
              // or subsequent saves will overwrite real cloud content.
              let encKey = useUIStore.getState().loadEncryptionKeyForSession?.(sessionId)
              const keyDeadline = Date.now() + 10_000
              while (!encKey && Date.now() < keyDeadline && !cancelled) {
                await new Promise((r) => setTimeout(r, 250))
                encKey = useUIStore.getState().loadEncryptionKeyForSession?.(sessionId)
              }
              if (encKey) {
                try {
                  const decrypted = await decrypt(data.encryptedData, encKey)
                  const blocks = JSON.parse(decrypted)
                  if (!cancelled) setInitialContent(blocks)
                } catch (err) {
                  console.warn('[DocAutoSave] decrypt failed:', err)
                }
              } else {
                // Key never showed up. Don't replace whatever localStorage
                // had — we keep showing the local copy and bail out of
                // ready-state to avoid overwriting cloud with empty content.
                console.warn('[DocAutoSave] scene key never loaded — leaving editor inactive')
                return
              }
            }
          } else if (res.status !== 404) {
            console.warn('[DocAutoSave] cloud load failed:', res.status)
          }
        } catch (err) {
          console.warn('[DocAutoSave] cloud fetch error:', err)
        }
      }

      if (!cancelled) setReady(true)
    }

    hydrate()
    return () => { cancelled = true }
  }, [active, ready, setLayoutMode])

  // Periodic cloud sync.
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => { syncToCloud().catch(() => {}) }, CLOUD_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active])

  // Flush on tab unload / visibility hide.
  useEffect(() => {
    if (!active) return
    const onUnload = () => {
      if (_localWriteTimer) { clearTimeout(_localWriteTimer); writeLocalNow() }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (_localWriteTimer) { clearTimeout(_localWriteTimer); writeLocalNow() }
        syncToCloud().catch(() => {})
      }
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      // Final flush.
      if (_localWriteTimer) { clearTimeout(_localWriteTimer); writeLocalNow() }
    }
  }, [active])

  return { initialContent, ready }
}
