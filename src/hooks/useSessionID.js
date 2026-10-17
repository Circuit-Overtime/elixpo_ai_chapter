"use client"

import { useEffect } from 'react'
import useUIStore from '@/store/useUIStore'
import { generateWorkspaceName } from '@/utils/nameGenerator'
import { createCanvasSessionId, rememberCanvasId } from '@/utils/canvasSession'

/**
 * Manages session ID in the URL and auto-generates workspace names.
 *
 * URL format: /c/<sessionID>#key=<encryptionKey>
 * - sessionID is the scene identifier (stored in pathname)
 * - key is the E2E encryption key (stored in fragment, never sent to server)
 *
 * On first load with no session ID, generates one and updates the URL.
 */
export default function useSessionID() {
  useEffect(() => {
    const path = window.location.pathname
    const segments = path.split('/').filter(Boolean)
    const searchParams = new URLSearchParams(window.location.search)
    const isExplicitNew = searchParams.get('new') === '1'
    const preserveOtherLocalWorkspaces = searchParams.get('preserveLocal') === '1'
    const isPathNew = segments[0] === 'c' && segments[1] === 'new'
    const isNewWorkspace = isExplicitNew || isPathNew

    // Expect URL format: /c/<sessionId>
    let sessionID = null

    if (segments[0] === 'c' && segments[1] && segments[1] !== 'new') {
      sessionID = segments[1]
    }

    // If this is a brand-new workspace (?new=1 or /c/new), always start fresh
    if (isNewWorkspace || !sessionID) {
      if (!sessionID) {
        // /c/new or no session — generate a fresh ID
        sessionID = createCanvasSessionId()
      }

      if (isNewWorkspace && !preserveOtherLocalWorkspaces) {
        // Clear ALL autosave data so the new workspace starts with a blank canvas
        localStorage.removeItem('lixsketch-autosave')
        localStorage.removeItem('lixsketch-autosave-meta')
        // Also clear any session-scoped keys from previous sessions
        try {
          const keysToRemove = []
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && (key.startsWith('lixsketch-autosave-') || key.startsWith('lixsketch-autosave-meta-'))) {
              keysToRemove.push(key)
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k))
        } catch {}
        localStorage.removeItem('lixsketch-workspace-name')
      }

      // Persist for guest reuse
      localStorage.setItem('lixsketch-guest-session', sessionID)

      // Clean URL: remove ?new=1 param, keep hash
      const hash = window.location.hash
      window.history.replaceState(null, '', `/c/${sessionID}${hash}`)
    } else {
      // Navigating to an existing session
      localStorage.setItem('lixsketch-guest-session', sessionID)
    }

    // Store on window for the engine
    window.__sessionID = sessionID
    rememberCanvasId(sessionID)
    // Flag so other hooks know this is a fresh workspace
    window.__isNewWorkspace = isNewWorkspace

    // Clear stale shapes from previous canvas (SPA navigation doesn't reload)
    if (isNewWorkspace && window.shapes) {
      window.shapes.length = 0
      window.currentShape = null
    }

    // Restore workspace name from localStorage, or generate on first visit
    const store = useUIStore.getState()
    if (isNewWorkspace) {
      // New workspace always gets a fresh name
      store.setWorkspaceName(generateWorkspaceName())
    } else {
      const saved = localStorage.getItem('lixsketch-workspace-name')
      if (saved) {
        store.setWorkspaceName(saved)
      } else {
        store.setWorkspaceName(generateWorkspaceName())
      }
    }
  }, [])
}

/**
 * Get the current session ID from the URL.
 */
export function getSessionID() {
  if (typeof window === 'undefined') return null
  if (window.__sessionID) return window.__sessionID
  const segments = window.location.pathname.split('/').filter(Boolean)
  if (segments[0] === 'c' && segments[1]) return segments[1]
  return null
}

/**
 * Build a shareable link for the current session.
 * The encryption key goes in the fragment (#key=...) so the server never sees it.
 */
export function getShareableLink(encryptionKey) {
  const origin = window.location.origin
  const sessionID = getSessionID()
  if (encryptionKey) {
    return `${origin}/c/${sessionID}#key=${encryptionKey}`
  }
  return `${origin}/c/${sessionID}`
}
