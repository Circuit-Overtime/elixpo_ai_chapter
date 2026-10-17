'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import LandingNav from '@/components/landing/LandingNav'
import useAuthStore from '@/store/useAuthStore'

export default function SignInPage() {
  const login = useAuthStore((state) => state.login)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const requestedNext = new URLSearchParams(window.location.search).get('next')
    login(requestedNext || '/profile')
  }, [login])

  return (
    <main className="min-h-screen bg-[#0a0a12] text-text-primary">
      <LandingNav />
      <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-6 pt-20 text-center">
        <div className="rounded-2xl border border-[#8B88E8]/25 bg-[#8B88E8]/[0.06] p-8">
          <i className="bx bx-loader-alt mb-4 animate-spin text-3xl text-[#A99CF1]" />
          <h1 className="text-lg">Opening secure sign in</h1>
          <p className="mt-2 text-xs leading-5 text-text-dim">
            Sign in with your Elixpo account before connecting personal Cloudinary storage.
          </p>
          <Link href="/profile?tab=integrations" className="mt-5 inline-block cursor-pointer text-xs text-[#A99CF1] hover:text-white">
            Return to integrations
          </Link>
        </div>
      </div>
    </main>
  )
}
