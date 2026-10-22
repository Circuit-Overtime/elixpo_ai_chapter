"use client"

import { useEffect, useState } from 'react'
import useAuthStore from '@/store/useAuthStore'
import { useProfileStore } from '@/hooks/useGuestProfile'
import { WORKER_URL } from '@/lib/env'
import { getPlanLimits, normalizePlanTier } from '@/lib/planLimits'

function publishPlan(tier, authenticated) {
  const normalizedTier = normalizePlanTier(tier, authenticated)
  const limits = getPlanLimits(normalizedTier)
  if (typeof window !== 'undefined') {
    window.__lixPlanTier = normalizedTier
    window.__roomImageLimitBytes = limits.imageBytesPerWorkspace
  }
  return { tier: normalizedTier, limits }
}

export default function usePlanEntitlements() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const profile = useProfileStore((state) => state.profile)
  const [plan, setPlan] = useState(() => publishPlan(user?.tier, isAuthenticated))

  useEffect(() => {
    let cancelled = false
    const fallback = publishPlan(user?.tier, isAuthenticated)
    setPlan(fallback)

    const identifier = isAuthenticated ? user?.id : profile?.id
    if (!identifier || !WORKER_URL) return undefined

    const param = isAuthenticated ? 'userId' : 'guestId'
    fetch(`${WORKER_URL}/api/user/quota-summary?${param}=${encodeURIComponent(identifier)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (cancelled || !data?.tier) return
        const next = publishPlan(data.tier, isAuthenticated)
        setPlan(next)
        if (isAuthenticated && user && user.tier !== next.tier) {
          useAuthStore.getState().updateUser({ tier: next.tier })
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [isAuthenticated, profile?.id, user?.id, user?.tier])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!isAuthenticated || !user?.id) {
      window.__personalCloudinary = { connected: false, useForUploads: false }
      return undefined
    }
    let cancelled = false
    fetch('/api/integrations/cloudinary', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && data) window.__personalCloudinary = data
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isAuthenticated, user?.id])

  return plan
}
