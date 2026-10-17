"use client"

import { create } from 'zustand'
import { WORKER_URL } from '@/lib/env'

const STORAGE_KEY = 'lixsketch-auth'
const COOKIE_NAME = 'lixsketch-session'
const ELIXPO_AUTH_URL = 'https://accounts.elixpo.com'
const AUTH_RETURN_TO_KEY = 'lixsketch-auth-return-to'
const SESSION_SYNC_INTERVAL = 60_000
let sessionSyncPromise = null
let lastSessionSync = 0
let authGeneration = 0

function normalizeAuthReturnTo(value) {
  if (typeof window === 'undefined' || typeof value !== 'string' || !value) return null
  try {
    const target = new URL(value, window.location.origin)
    if (target.origin !== window.location.origin) return null
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return null
  }
}

export function consumeAuthReturnTo() {
  if (typeof window === 'undefined') return null
  try {
    const returnTo = normalizeAuthReturnTo(sessionStorage.getItem(AUTH_RETURN_TO_KEY))
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY)
    return returnTo
  } catch {
    return null
  }
}

function loadAuth() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
    if (match) return JSON.parse(decodeURIComponent(match[1]))
  } catch {}
  return null
}

function saveAuth(data) {
  if (typeof window === 'undefined') return
  try {
    if (data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } else {
      localStorage.removeItem(STORAGE_KEY)
      // Clears legacy script-readable sessions. Current sessions are HttpOnly
      // and are cleared by DELETE /api/auth/session below.
      document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`
    }
  } catch {}
}

async function fetchServerSession(sessionToken) {
  const response = await fetch('/api/auth/session', {
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (response.status === 401) return null
  if (!response.ok) throw new Error(`Session verification failed (${response.status})`)
  return response.json()
}

const useAuthStore = create((set, get) => ({
  user: null,
  sessionToken: null,
  isAuthenticated: false,
  activeRooms: 0,
  maxRooms: 1,
  loading: true,

  init: () => {
    const saved = loadAuth()
    if (saved?.sessionToken && saved?.user) {
      // Older sessions may exist only in localStorage. Keep the same session
      // available to Edge routes before integrations initiate navigation.
      saveAuth(saved)
      console.log('[Auth] Restored session:', saved.user.displayName || saved.user.email)
      set({
        user: saved.user,
        sessionToken: saved.sessionToken,
        isAuthenticated: true,
      })
    }
    if (sessionSyncPromise) return sessionSyncPromise
    if (Date.now() - lastSessionSync < SESSION_SYNC_INTERVAL) {
      set({ loading: false })
      return Promise.resolve()
    }
    set({ loading: true })
    const generation = authGeneration
    sessionSyncPromise = fetchServerSession(saved?.sessionToken)
      .then((session) => {
        if (generation !== authGeneration) return
        lastSessionSync = Date.now()
        if (!session?.sessionToken || !session?.user) {
          saveAuth(null)
          set({ user: null, sessionToken: null, isAuthenticated: false })
          return
        }
        saveAuth(session)
        set({ user: session.user, sessionToken: session.sessionToken, isAuthenticated: true })
      })
      .catch((error) => {
        // A network/deployment failure must not erase a locally restored
        // session. The next init call can retry server synchronization.
        console.warn('[Auth] Session synchronization failed:', error?.message || error)
      })
      .finally(() => {
        set({ loading: false })
        sessionSyncPromise = null
      })
    return sessionSyncPromise
  },

  login: (returnTo) => {
    const clientId = process.env.NEXT_PUBLIC_ELIXPO_AUTH_CLIENT_ID
    if (!clientId) {
      console.error('[Auth] Missing NEXT_PUBLIC_ELIXPO_AUTH_CLIENT_ID')
      return
    }
    const appOrigin = window.location.origin
    const redirectUri = `${appOrigin}/api/auth/callback`
    const state = crypto.randomUUID()

    sessionStorage.setItem('lixsketch-oauth-state', state)

    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const authReturnTo = normalizeAuthReturnTo(
      typeof returnTo === 'string' ? returnTo : currentLocation,
    )
    try {
      if (authReturnTo && authReturnTo !== '/') {
        sessionStorage.setItem(AUTH_RETURN_TO_KEY, authReturnTo)
      } else {
        sessionStorage.removeItem(AUTH_RETURN_TO_KEY)
      }
    } catch {}

    const authUrl = `${ELIXPO_AUTH_URL}/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=openid profile email`

    console.log('[Auth] Redirecting to Elixpo SSO...', { redirectUri })
    window.location.href = authUrl
  },

  handleCallback: async (sessionToken, user) => {
    console.log('[Auth] Saving session for:', user.displayName || user.email)
    authGeneration += 1
    lastSessionSync = Date.now()
    saveAuth({ sessionToken, user })
    set({
      user,
      sessionToken,
      isAuthenticated: true,
      loading: false,
    })
  },

  updateUser: (patch) => {
    const current = get().user
    if (!current) return
    const user = { ...current, ...patch }
    set({ user })
    saveAuth({ sessionToken: get().sessionToken, user })
  },

  // Validate session by hitting Elixpo /api/auth/me with the access token
  fetchMe: async () => {
    const token = get().sessionToken
    try {
      const session = await fetchServerSession(token)
      if (!session?.sessionToken || !session?.user) {
        console.warn('[Auth] Session expired or invalid, logging out')
        get().logout()
        return
      }
      saveAuth(session)
      set({ user: session.user, sessionToken: session.sessionToken, isAuthenticated: true })
    } catch {
      // Network error — keep existing state
    }
  },

  logout: () => {
    console.log('[Auth] Signing out')
    authGeneration += 1
    lastSessionSync = 0
    void fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
    saveAuth(null)
    set({
      user: null,
      sessionToken: null,
      isAuthenticated: false,
      activeRooms: 0,
      loading: false,
    })
  },
}))

export default useAuthStore
export { WORKER_URL }
