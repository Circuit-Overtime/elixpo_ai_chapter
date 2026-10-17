"use client"

import { useEffect, useRef } from 'react'
import LZString from 'lz-string'
import useCollabStore from '@/store/useCollabStore'
import useUIStore, { normalizeSceneColorsForTheme } from '@/store/useUIStore'
import { WORKER_URL } from '@/store/useAuthStore'
import useAuthStore from '@/store/useAuthStore'
import { getSessionID } from '@/hooks/useSessionID'
import { encrypt, generateKey } from '@/utils/encryption'
import { useProfileStore } from '@/hooks/useGuestProfile'

const LOCAL_SAVE_KEY_PREFIX = 'lixsketch-autosave'
const LOCAL_SAVE_META_KEY_PREFIX = 'lixsketch-autosave-meta'

// Issue #24 bug #8: localStorage acts as a buffer between the user and
// the cloud. Compress the JSON payload before writing — image data URLs
// and large scenes can blow past the ~5–10 MB localStorage quota fast.
// LZString.compressToUTF16 keeps the result as a valid UTF-16 string
// that localStorage can store as-is. The prefix lets the reader detect
// the format and fall back to plain JSON for any legacy entries.
const COMPRESSED_PREFIX = 'lzs:'

export function writeLocalScene(key, sceneData) {
  const json = JSON.stringify(sceneData)
  const compressed = COMPRESSED_PREFIX + LZString.compressToUTF16(json)
  try {
    localStorage.setItem(key, compressed)
    return true
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      // Last-resort: drop any other sessions' caches and retry once.
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i)
          if (k && k.startsWith(LOCAL_SAVE_KEY_PREFIX) && k !== key) localStorage.removeItem(k)
        }
        localStorage.setItem(key, compressed)
        console.warn('[AutoSave] Quota exceeded — purged stale autosave entries to make room')
        return true
      } catch {
        console.error('[AutoSave] Quota exceeded and could not free space — local save dropped')
        return false
      }
    }
    console.warn('[AutoSave] Local write failed:', err)
    return false
  }
}

export function readLocalScene(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    if (raw.startsWith(COMPRESSED_PREFIX)) {
      const decompressed = LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length))
      if (!decompressed) return null
      return JSON.parse(decompressed)
    }
    // Legacy uncompressed entry — keep readable so existing users don't
    // lose their scene on first load after the upgrade.
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[AutoSave] Local read parse failed:', err)
    return null
  }
}

function getLocalSaveKey() {
  // Issue #24 bug #8: previously fell back to a sessionless `lixsketch-
  // autosave` key when __sessionID hadn't been set yet, leaving an
  // orphan that the cleanup pass explicitly skipped. Return null so the
  // caller waits for a real session instead of writing garbage.
  const sessionId = window.__sessionID
  return sessionId ? `${LOCAL_SAVE_KEY_PREFIX}-${sessionId}` : null
}
function getLocalSaveMetaKey() {
  const sessionId = window.__sessionID
  return sessionId ? `${LOCAL_SAVE_META_KEY_PREFIX}-${sessionId}` : null
}

function getCloudSceneRevision(sessionId) {
  if (!sessionId || window.__cloudSceneRevisionSession !== sessionId) return undefined
  return Number.isInteger(window.__cloudSceneRevision) ? window.__cloudSceneRevision : undefined
}

function setCloudSceneRevision(sessionId, revision) {
  if (!sessionId || !Number.isInteger(revision)) return
  window.__cloudSceneRevisionSession = sessionId
  window.__cloudSceneRevision = revision
}

// ── Intervals ──
const LOCAL_BUFFER_INTERVAL = 3_000    // localStorage buffer: every 3 seconds
const CLOUD_SYNC_INTERVAL = 5 * 60_000 // DB sync: every 5 minutes

// ── Rate limiting: max 2 DB saves per minute ──
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 2
const _dbSaveTimestamps = []
// Sessions confirmed missing from cloud should remain local until the user
// explicitly requests a cloud save. This prevents an automatic 404 → POST
// → workspace-limit loop for guest canvases restored from the browser.
const _automaticCloudSyncBlocked = new Set()
let _workspaceDeletionInProgress = false

export function beginWorkspaceDeletion() {
  _workspaceDeletionInProgress = true
  const sessionId = getSessionID()
  if (sessionId) _automaticCloudSyncBlocked.add(sessionId)
}

function isRateLimited() {
  const now = Date.now()
  // Remove timestamps older than the window
  while (_dbSaveTimestamps.length > 0 && now - _dbSaveTimestamps[0] > RATE_LIMIT_WINDOW) {
    _dbSaveTimestamps.shift()
  }
  return _dbSaveTimestamps.length >= RATE_LIMIT_MAX
}

function recordDbSave() {
  _dbSaveTimestamps.push(Date.now())
}

async function getOrCreateSessionEncryptionKey(sessionId) {
  const store = useUIStore.getState()
  // Resolve by session ID first. A global in-memory key may belong to the
  // canvas visited immediately before this one during SPA navigation.
  const existingKey = store.loadEncryptionKeyForSession?.(sessionId)
  if (existingKey) return existingKey

  const key = await generateKey()
  store.setSessionEncryptionKey?.(key, sessionId)
  return key
}

// ── Save to localStorage (the buffer) ──
function saveToLocalStorage() {
  if (_workspaceDeletionInProgress) return false
  const serializer = window.__sceneSerializer
  const shapes = window.shapes
  if (!serializer || !Array.isArray(shapes)) return false

  // Wait for sessionID — without it we have no stable key to write to.
  const key = getLocalSaveKey()
  const metaKey = getLocalSaveMetaKey()
  if (!key || !metaKey) return false

  try {
    const workspaceName = useUIStore.getState().workspaceName || 'Untitled'
    const sceneData = serializer.save(workspaceName)
    const ok = writeLocalScene(key, sceneData)
    if (!ok) return false
    localStorage.setItem(metaKey, JSON.stringify({
      workspaceName,
      savedAt: Date.now(),
      shapeCount: shapes.length,
    }))

    // Signal the UI that a local save just happened
    if (typeof window.__onLocalSave === 'function') window.__onLocalSave()
    const status = useUIStore.getState().saveStatus
    if (status !== 'local' && status !== 'cloud') {
      useUIStore.getState().setSaveStatus('local')
    }
    return true
  } catch (err) {
    console.warn('[AutoSave] Local buffer save failed:', err)
    return false
  }
}

// ── Show quick-save toast ──
function showSaveToast() {
  const toast = document.getElementById('save-toast')
  if (!toast) return
  toast.classList.remove('hidden')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 2000)
}

// ── Save to DB (from localStorage buffer) ──
async function saveToDb({ force = false } = {}) {
  if (_workspaceDeletionInProgress) return false
  if (!WORKER_URL) return false

  const sessionId = getSessionID()
  if (!sessionId) return false
  if (!force && _automaticCloudSyncBlocked.has(sessionId)) return false

  if (isRateLimited()) {
    console.log('[AutoSave] Rate limited — skipping DB save')
    return false
  }

  const serializer = window.__sceneSerializer
  if (!serializer) return false

  try {
    const authState = useAuthStore.getState()
    const workspaceName = useUIStore.getState().workspaceName || 'Untitled'

    // Read from localStorage buffer (single source of truth). The buffer
    // stores compressed payload now (issue #24 bug #8) — decompress before
    // handing the JSON to the cloud encryption step.
    let sceneJSON
    const bufferKey = getLocalSaveKey()
    const localScene = bufferKey ? readLocalScene(bufferKey) : null
    if (localScene) {
      sceneJSON = JSON.stringify(localScene)
    } else {
      // Fallback: serialize current state
      const sceneData = serializer.save(workspaceName)
      sceneJSON = JSON.stringify(sceneData)
    }

    // Reuse the session key so existing encrypted canvas links remain valid
    // after subsequent saves. Generate it only for the first cloud write.
    const key = await getOrCreateSessionEncryptionKey(sessionId)
    const encryptedData = await encrypt(sceneJSON, key)

    const createdBy = authState.isAuthenticated
      ? (authState.user?.id || 'anonymous')
      : (useProfileStore.getState().profile?.id || localStorage.getItem('lixsketch-guest-session') || 'anonymous')

    const res = await fetch(`${WORKER_URL}/api/scenes/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        encryptedData,
        permission: 'edit',
        workspaceName,
        createdBy,
        ownerType: authState.isAuthenticated ? 'user' : 'guest',
        expectedRevision: getCloudSceneRevision(sessionId),
      }),
    })

    if (res.ok) {
      const saved = await res.json().catch(() => ({}))
      setCloudSceneRevision(sessionId, saved.revision)
      _automaticCloudSyncBlocked.delete(sessionId)
      recordDbSave()
      useUIStore.getState().setSaveStatus('cloud')
      // Store encryption key for this session
      useUIStore.getState().setSessionEncryptionKey?.(key, sessionId)
      window.invalidateCanvasResetUndo?.()
      console.log('[AutoSave] Synced to cloud')
      return true
    } else if (res.status === 409) {
      const data = await res.json().catch(() => ({}))
      window.__remoteSceneConflict = data
      console.warn('[AutoSave] Remote edit conflict — cloud save paused', data)
      useUIStore.getState().setSaveStatus('failed')
      window.dispatchEvent(new CustomEvent('lix-remote-scene-conflict', { detail: data }))
      showRemoteSceneToast('Remote edit conflict — reload before saving')
      return false
    } else if (res.status === 429) {
      _automaticCloudSyncBlocked.add(sessionId)
      const data = await res.json().catch(() => ({}))
      console.warn(`[AutoSave] Workspace limit reached (${data.currentCount}/${data.maxWorkspaces}). ${data.message || ''}`)
      useUIStore.getState().setSaveStatus('local')
      return false
    } else {
      console.warn('[AutoSave] DB save failed:', res.status)
      useUIStore.getState().setSaveStatus('failed')
      return false
    }
  } catch (err) {
    console.warn('[AutoSave] DB save failed:', err)
    useUIStore.getState().setSaveStatus('failed')
    return false
  }
}

/**
 * Trigger an immediate cloud sync from anywhere (e.g. Ctrl+S).
 * Saves to localStorage first, then pushes to DB.
 */
export async function triggerCloudSync() {
  saveToLocalStorage()
  const ok = await saveToDb({ force: true })
  if (ok) showSaveToast()
  return ok
}

/**
 * Auto-saves the scene using localStorage as a constant buffer.
 *
 * Flow:
 *   1. Page load → render local buffer immediately; use cloud when no cache exists
 *   2. Continuous: localStorage updates every 3s (+ on every SVG mutation)
 *   3. DB sync: every 5 min, on back/close/canvas-switch
 *   4. Rate limit: max 2 DB saves per minute
 *   5. Status: green=cloud, yellow=local buffer, red=DB failed
 *   6. Toast on successful DB save
 */
export default function useAutoSave() {
  const roomId = useCollabStore((s) => s.roomId)
  const connected = useCollabStore((s) => s.connected)
  const hasRestored = useRef(false)

  const isInRoom = !!(roomId && connected)

  // ──────────────────────────────────────────────────────
  // 1. RESTORE: localStorage fast path → cloud fallback
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (hasRestored.current) return
    if (isInRoom) return

    let cancelled = false
    let restoreFrame = null
    let backgroundTimer = null
    const restoreStartedAt = performance.now()

    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    if (!isLocalhost) {
      useUIStore.getState().setCanvasLoading(true, 'Restoring canvas...')
    }

    const makeRestoredSceneInteractive = () => {
        // Clear any selection that might have been set during deserialization
        window.currentShape = null
        if (typeof window.__deselectTextElement === 'function') window.__deselectTextElement()
        if (typeof window.disableAllSideBars === 'function') window.disableAllSideBars()

        // Force selection tool active so shapes are clickable/draggable
        if (window.__sketchEngine && typeof window.__sketchEngine.setActiveTool === 'function') {
          window.__sketchEngine.setActiveTool('select')
        } else {
          window.isSelectionToolActive = true
        }
        // Sync Zustand store too so toolbar reflects correct tool
        try {
          const store = window.__sketchStoreApi
          if (store && store.setActiveTool) store.setActiveTool('select')
        } catch {}
    }

    const finishRestore = (source, shapeCount = 0) => {
      if (cancelled) return
      if (source !== 'blank') makeRestoredSceneInteractive()
      hasRestored.current = true
      useUIStore.getState().setCanvasLoading(false)
      const durationMs = Math.round(performance.now() - restoreStartedAt)
      window.__canvasRestoreMetrics = { source, shapeCount, durationMs }
      window.dispatchEvent(new CustomEvent('lix-canvas-restored', {
        detail: window.__canvasRestoreMetrics,
      }))
      console.log(`[AutoSave] Canvas ready from ${source} in ${durationMs}ms (${shapeCount} shapes)`)
    }

    const cleanupStaleCaches = (currentKey, currentMetaKey) => {
      try {
        const keysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || !key.startsWith(LOCAL_SAVE_KEY_PREFIX)) continue
          if (key === currentKey || key === currentMetaKey) continue
          keysToRemove.push(key)
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key))
      } catch {}
    }

    const parseCloudTimestamp = (value) => {
      if (!value || typeof value !== 'string') return 0
      // SQLite datetime('now') omits the timezone marker even though the
      // value is UTC. Add it before parsing so comparisons work outside UTC.
      const iso = /(?:z|[+-]\d\d:\d\d)$/i.test(value)
        ? value
        : `${value.replace(' ', 'T')}Z`
      return Date.parse(iso) || 0
    }

    const fetchCloudScene = async (showLoading = false) => {
      if (!WORKER_URL) return { status: 'unavailable' }
      try {
        if (showLoading) useUIStore.getState().setCanvasLoading(true, 'Fetching from cloud...')
        const sessionId = getSessionID()
        const res = await fetch(`${WORKER_URL}/api/scenes/load?sessionId=${sessionId}`)
        if (!res.ok || cancelled) return { status: 'unavailable' }
        const data = await res.json()
        setCloudSceneRevision(sessionId, data.revision)
        if (data.missing || !data.encryptedData) {
          _automaticCloudSyncBlocked.add(sessionId)
          return { status: 'missing', metadata: data }
        }

        const encKey = useUIStore.getState().loadEncryptionKeyForSession(sessionId)
        if (!encKey) return { status: 'locked', metadata: data }
        const { decrypt } = await import('@/utils/encryption')
        const decrypted = await decrypt(data.encryptedData, encKey)
        const sceneData = JSON.parse(decrypted)
        if (cancelled || sceneData?.format !== 'lixsketch' || !Array.isArray(sceneData.shapes)) {
          return { status: 'invalid' }
        }

        _automaticCloudSyncBlocked.delete(sessionId)
        normalizeSceneColorsForTheme(sceneData, useUIStore.getState().resolvedTheme)
        return { status: 'found', sceneData, metadata: data }
      } catch (err) {
        console.warn('[AutoSave] Cloud fetch failed:', err)
        return { status: 'unavailable' }
      }
    }

    const restoreFromCloud = async (serializer, currentKey) => {
      const cloud = await fetchCloudScene(true)
      if (cloud.status !== 'found' || cancelled) return false
      if (currentKey) writeLocalScene(currentKey, cloud.sceneData)
      serializer.load(cloud.sceneData)
      if (cloud.metadata.workspaceName) {
        useUIStore.getState().setWorkspaceName(cloud.metadata.workspaceName)
      }
      if (cloud.metadata.templateSlug) {
        useUIStore.getState().setTemplateInfo(cloud.metadata.templateSlug, cloud.metadata.templateStatus)
      }
      useUIStore.getState().setSaveStatus('cloud')
      finishRestore('cloud', cloud.sceneData.shapes.length)
      return true
    }

    const tryRestore = async () => {
      if (cancelled) return

      // Never expose the canvas before its pointer dispatcher is bound. This
      // applies to blank canvases too: drawing immediately after navigation
      // must work just as reliably as dragging a restored shape.
      const serializer = window.__sceneSerializer
      if (!serializer || !window.svg || !window.__sketchInteractionReady) {
        // Poll on the next paint instead of sleeping for 500–800 ms. This
        // makes engine initialization, not an arbitrary timer, the fast-path
        // boundary.
        restoreFrame = requestAnimationFrame(tryRestore)
        return
      }

      if (window.__isNewWorkspace) {
        console.log('[AutoSave] New workspace — starting with blank canvas')
        finishRestore('blank')
        return
      }
      if (window.shapes?.length > 0) {
        finishRestore('existing', window.shapes.length)
        return
      }

      const currentKey = getLocalSaveKey()
      const currentMetaKey = getLocalSaveMetaKey()

      // localStorage is the presentation fast path. It is already the
      // continuously updated save buffer, so render it before any network
      // request and reconcile it back to the cloud in the background.
      if (currentKey) {
        const sceneData = readLocalScene(currentKey)
        if (sceneData?.format === 'lixsketch' && Array.isArray(sceneData.shapes)) {
          try {
            normalizeSceneColorsForTheme(sceneData, useUIStore.getState().resolvedTheme)
            serializer.load(sceneData)
            const meta = currentMetaKey ? localStorage.getItem(currentMetaKey) : null
            let localSavedAt = Date.parse(sceneData.createdAt) || 0
            if (meta) {
              try {
                const { workspaceName, savedAt } = JSON.parse(meta)
                if (workspaceName) useUIStore.getState().setWorkspaceName(workspaceName)
                if (Number.isFinite(savedAt)) localSavedAt = savedAt
              } catch {}
            }
            useUIStore.getState().setSaveStatus('local')
            // Treat a restored browser buffer as local-only until the
            // background lookup proves that its cloud row exists.
            _automaticCloudSyncBlocked.add(getSessionID())
            finishRestore('local', sceneData.shapes.length)
            backgroundTimer = setTimeout(async () => {
              cleanupStaleCaches(currentKey, currentMetaKey)
              const cloud = await fetchCloudScene()
              if (cancelled) return
              if (cloud.status !== 'found') return
              const cloudUpdatedAt = parseCloudTimestamp(cloud.metadata.updatedAt)
              if (cloudUpdatedAt > localSavedAt) {
                writeLocalScene(currentKey, cloud.sceneData)
                serializer.load(cloud.sceneData)
                makeRestoredSceneInteractive()
                if (cloud.metadata.workspaceName) {
                  useUIStore.getState().setWorkspaceName(cloud.metadata.workspaceName)
                }
                useUIStore.getState().setSaveStatus('cloud')
                window.__canvasRestoreMetrics.reconciledFrom = 'cloud'
              } else {
                // The row exists and local edits are newer, so reconcile the
                // browser buffer up to that same cloud workspace.
                saveToDb()
              }
            }, 1000)
            return
          } catch (err) {
            console.warn('[AutoSave] Failed to restore from local:', err)
          }
        }
      }

      const restoredFromCloud = await restoreFromCloud(serializer, currentKey)
      if (!restoredFromCloud) finishRestore('blank')
      backgroundTimer = setTimeout(() => cleanupStaleCaches(currentKey, currentMetaKey), 0)
    }

    // Start immediately. The previous 800 ms delay consumed most of the
    // sub-second restore budget before any storage was read.
    tryRestore()

    return () => {
      cancelled = true
      if (restoreFrame !== null) cancelAnimationFrame(restoreFrame)
      if (backgroundTimer !== null) clearTimeout(backgroundTimer)
    }
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 2. AUTO-SAVE ON EVERY CANVAS CHANGE (debounced)
  //    MutationObserver catches all DOM changes; mouseup catches
  //    the end of draw/move/resize operations.
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom) return

    let hasWarnedAboutEditingPublished = false
    let debounceTimer = null
    const debouncedSave = () => {
      if (window.__applyingAgentScene) return
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const ui = useUIStore.getState()
        if (ui.templateSlug && !hasWarnedAboutEditingPublished) {
          hasWarnedAboutEditingPublished = true
          const proceed = window.confirm(
            "This workspace is published as a public template. Any edits you make will update the source template, but existing forks and clones of this template will not receive these updates. Do you want to proceed?"
          )
          if (!proceed) {
            window.location.reload()
            return
          }
        }

        saveToLocalStorage()
        // Mark dirty relative to cloud
        const status = useUIStore.getState().saveStatus
        if (status === 'cloud') {
          useUIStore.getState().setSaveStatus('local')
        }
      }, 400) // 400ms debounce — fast enough to feel instant, avoids thrashing
    }

    const waitForSvg = () => {
      const svg = window.svg
      if (!svg) { setTimeout(waitForSvg, 500); return }

      const observer = new MutationObserver(debouncedSave)
      observer.observe(svg, { childList: true, subtree: true, attributes: true })
      svg.addEventListener('mouseup', debouncedSave)

      observerRef.current = { observer, svg }
    }

    const observerRef = { current: null }
    waitForSvg()

    return () => {
      clearTimeout(debounceTimer)
      if (observerRef.current) {
        observerRef.current.observer.disconnect()
        observerRef.current.svg.removeEventListener('mouseup', debouncedSave)
      }
    }
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 3. LOCALSTORAGE BUFFER: constant updates (every 3s + beforeunload)
  //    Includes zoom level and canvas pan state
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom) return

    const interval = setInterval(saveToLocalStorage, LOCAL_BUFFER_INTERVAL)

    const handleUnload = () => saveToLocalStorage()
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleUnload)
      saveToLocalStorage() // final save on cleanup
    }
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 4. DB SYNC: every 5 min + back button + page close + canvas switch
  //    Rate limited to 2 saves per minute
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom) return
    if (!WORKER_URL) return

    // Periodic sync every 5 minutes
    const interval = setInterval(() => {
      const shapes = window.shapes
      if (!shapes || shapes.length === 0) return
      saveToDb()
    }, CLOUD_SYNC_INTERVAL)

    // Save to DB on page close / back button / navigation away
    const handleBeforeUnload = () => {
      saveToLocalStorage()
      // Use sendBeacon for reliable save on page close
      const serializer = window.__sceneSerializer
      if (!serializer) return

      try {
        const localData = localStorage.getItem(getLocalSaveKey())
        if (localData) {
          // Best-effort beacon (can't encrypt here synchronously, so just save to localStorage)
          // The next load will push localStorage → DB
          console.log('[AutoSave] Page closing — localStorage buffer is up to date')
        }
      } catch {}
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Save on back/forward navigation (popstate)
    const handlePopState = () => {
      saveToLocalStorage()
      saveToDb()
    }
    window.addEventListener('popstate', handlePopState)

    // Save on visibility change (user switches tab/minimizes)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveToLocalStorage()
        saveToDb()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 5. NEW WORKSPACE: save immediately on creation
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom) return
    if (!WORKER_URL) return
    if (!window.__isNewWorkspace) return

    const saveNewWorkspace = async () => {
      const serializer = window.__sceneSerializer
      if (!serializer || !window.svg) {
        setTimeout(saveNewWorkspace, 1000)
        return
      }

      try {
        const authState = useAuthStore.getState()
        const workspaceName = useUIStore.getState().workspaceName || 'Untitled'
        const sceneData = serializer.save(workspaceName)
        const sceneJSON = JSON.stringify(sceneData)

        const sessionId = getSessionID()
        const key = await getOrCreateSessionEncryptionKey(sessionId)
        const encryptedData = await encrypt(sceneJSON, key)
        const createdBy = authState.isAuthenticated
          ? (authState.user?.id || 'anonymous')
          : (useProfileStore.getState().profile?.id || localStorage.getItem('lixsketch-guest-session') || 'anonymous')

        const res = await fetch(`${WORKER_URL}/api/scenes/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            encryptedData,
            permission: 'edit',
            workspaceName,
            createdBy,
            ownerType: authState.isAuthenticated ? 'user' : 'guest',
          }),
        })

        if (res.ok) {
          const saved = await res.json().catch(() => ({}))
          setCloudSceneRevision(sessionId, saved.revision)
          useUIStore.getState().setSaveStatus('cloud')
          useUIStore.getState().setSessionEncryptionKey?.(key, sessionId)
          console.log('[AutoSave] New workspace saved to cloud')
        } else if (res.status === 429) {
          const data = await res.json().catch(() => ({}))
          console.warn(`[AutoSave] Workspace limit reached (${data.currentCount}/${data.maxWorkspaces}). ${data.message || ''}`)
        }
      } catch (err) {
        console.warn('[AutoSave] Failed to save new workspace:', err)
      }

      window.__isNewWorkspace = false
    }

    setTimeout(saveNewWorkspace, 2000)
  }, [isInRoom])

  // ──────────────────────────────────────────────────────
  // 6. REMOTE AGENT REFRESH: active collaboration relays immediately;
  //    otherwise poll the encrypted cloud revision without touching recency.
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isInRoom || !WORKER_URL) return
    let applying = false
    let warnedRevision = null

    const checkRemoteRevision = async () => {
      if (applying || document.visibilityState === 'hidden') return
      const sessionId = getSessionID()
      const serializer = window.__sceneSerializer
      if (!sessionId || !serializer) return
      try {
        const response = await fetch(`${WORKER_URL}/api/scenes/load?sessionId=${encodeURIComponent(sessionId)}&touch=0&meta=1`, { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        const revision = Number(data.revision)
        if (!Number.isInteger(revision)) return
        const localRevision = getCloudSceneRevision(sessionId)
        if (!Number.isInteger(localRevision)) {
          setCloudSceneRevision(sessionId, revision)
          return
        }
        if (revision <= localRevision) return
        if (useUIStore.getState().saveStatus !== 'cloud') {
          if (warnedRevision !== revision) {
            warnedRevision = revision
            window.__remoteSceneConflict = { currentRevision: revision, localRevision }
            window.dispatchEvent(new CustomEvent('lix-remote-scene-conflict', { detail: window.__remoteSceneConflict }))
            showRemoteSceneToast('A remote edit is waiting — reload to avoid overwriting it')
          }
          return
        }
        const key = useUIStore.getState().loadEncryptionKeyForSession(sessionId)
        if (!key) return
        applying = true
        const sceneResponse = await fetch(`${WORKER_URL}/api/scenes/load?sessionId=${encodeURIComponent(sessionId)}&touch=0`, { cache: 'no-store' })
        if (!sceneResponse.ok) return
        const scenePayload = await sceneResponse.json()
        if (Number(scenePayload.revision) !== revision || !scenePayload.encryptedData) return
        const { decrypt } = await import('@/utils/encryption')
        const sceneData = JSON.parse(await decrypt(scenePayload.encryptedData, key))
        normalizeSceneColorsForTheme(sceneData, useUIStore.getState().resolvedTheme)
        window.__applyingAgentScene = true
        serializer.load(sceneData)
        const localKey = getLocalSaveKey()
        if (localKey) writeLocalScene(localKey, sceneData)
        if (scenePayload.workspaceName) useUIStore.getState().setWorkspaceName(scenePayload.workspaceName)
        setCloudSceneRevision(sessionId, revision)
        useUIStore.getState().setSaveStatus('cloud')
        showRemoteSceneToast('MCP agent updated the canvas')
        window.dispatchEvent(new CustomEvent('lix-agent-scene-applied', { detail: { revision } }))
        setTimeout(() => { window.__applyingAgentScene = false }, 0)
      } catch (error) {
        console.warn('[AutoSave] Remote revision check failed:', error)
      } finally {
        applying = false
      }
    }

    const interval = setInterval(checkRemoteRevision, 4000)
    return () => clearInterval(interval)
  }, [isInRoom])
}

function showRemoteSceneToast(message) {
  const toast = document.getElementById('save-toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.remove('hidden')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 3500)
}
