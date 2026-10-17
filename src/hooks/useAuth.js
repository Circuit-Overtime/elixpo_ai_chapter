"use client"

import { useEffect } from 'react'
import useAuthStore, { consumeAuthReturnTo } from '@/store/useAuthStore'

export default function useAuth() {
  const init = useAuthStore((s) => s.init)
  const handleCallback = useAuthStore((s) => s.handleCallback)

  useEffect(() => {
    const url = new URL(window.location.href)

    // Check for auth error from callback
    const authError = url.searchParams.get('auth_error')
    if (authError) {
      const detail = url.searchParams.get('detail')
      console.error('[Auth] SSO error:', authError, detail || '')
      // Clean URL
      url.searchParams.delete('auth_error')
      url.searchParams.delete('detail')
      window.history.replaceState(null, '', url.pathname + url.hash)
      // Still init guest profile
      init()
      return
    }

    // Check for OAuth callback params
    const authToken = url.searchParams.get('auth_token')
    const authUser = url.searchParams.get('auth_user')

    if (authToken && authUser) {
      let callbackHandled = false
      try {
        const user = JSON.parse(authUser)
        console.log('[Auth] SSO callback received:', { id: user.id, email: user.email, displayName: user.displayName })
        handleCallback(authToken, user)
        callbackHandled = true
      } catch (e) {
        console.error('[Auth] Failed to parse callback params:', e)
      }

      // Clean URL params without reload
      url.searchParams.delete('auth_token')
      url.searchParams.delete('auth_user')
      window.history.replaceState(null, '', url.pathname + url.hash)

      if (callbackHandled) {
        const returnTo = consumeAuthReturnTo()
        if (returnTo) {
          window.__lixAuthRedirecting = true
          window.location.replace(returnTo)
        }
      }
      return
    }

    // Normal init — restore from localStorage/cookie
    init()
  }, [init, handleCallback])
}
