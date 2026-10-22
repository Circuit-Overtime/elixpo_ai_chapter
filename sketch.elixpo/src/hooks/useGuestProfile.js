"use client"

import { useEffect } from 'react'
import { create } from 'zustand'
import { generateAvatar, generateGuestName } from '@/utils/avatarGenerator'

const STORAGE_KEY = 'lixsketch-guest-profile'

function loadProfile() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function saveProfile(profile) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {}
}

function createProfile() {
  const name = generateGuestName()
  const id = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const avatar = generateAvatar(id)
  return { id, displayName: name, avatar, isGuest: true }
}

const useProfileStore = create((set, get) => ({
  profile: null,

  initProfile: () => {
    let profile = loadProfile()
    if (!profile) {
      profile = createProfile()
      saveProfile(profile)
    }
    // Regenerate avatar from ID to ensure it's current
    profile.avatar = generateAvatar(profile.id)
    set({ profile })
  },

  setDisplayName: (name) => {
    const profile = { ...get().profile, displayName: name }
    profile.avatar = generateAvatar(profile.id)
    saveProfile(profile)
    set({ profile })
  },

  regenerateProfile: () => {
    const profile = createProfile()
    saveProfile(profile)
    set({ profile })
  },
}))

export default function useGuestProfile() {
  const initProfile = useProfileStore((s) => s.initProfile)

  useEffect(() => {
    initProfile()
  }, [initProfile])
}

export { useProfileStore }
