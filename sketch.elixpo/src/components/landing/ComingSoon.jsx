'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useAuthStore from '@/store/useAuthStore'
import LandingNav from './LandingNav'
import LandingFooter from './LandingFooter'

export default function ComingSoon({ title, description, icon }) {
  const canvasRef = useRef(null)
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted || !canvas) return

      const ctx = canvas.getContext('2d')
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight

      // Subtle background doodles
      rc.circle(w * 0.15, h * 0.3, 60, { stroke: '#7667a8', strokeWidth: 1, roughness: 3 })
      rc.rectangle(w * 0.75, h * 0.2, 80, 50, { stroke: '#444480', strokeWidth: 1, roughness: 2.5 })
      rc.line(w * 0.3, h * 0.7, w * 0.5, h * 0.6, { stroke: '#c873e4', strokeWidth: 1, roughness: 2 })
      rc.ellipse(w * 0.85, h * 0.75, 100, 50, { stroke: '#3a3a50', strokeWidth: 1, roughness: 3 })
    }

    draw()
    return () => { mounted = false }
  }, [])

  return (
    <div className="min-h-screen bg-[#120e1a] text-white font-[lixFont] overflow-x-hidden flex flex-col">
      <LandingNav />

      <main className="flex-1 flex items-center justify-center relative pt-16">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center px-6 max-w-lg"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-16 h-16 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center mx-auto mb-6"
          >
            <i className={`${icon} text-3xl text-accent-blue`} />
          </motion.div>

          <h1 className="text-3xl md:text-4xl font-light mb-3">{title}</h1>
          <p className="text-text-dim text-base mb-8 leading-relaxed">{description}</p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent/30 bg-accent/5 text-accent text-sm mb-10"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Coming Soon
          </motion.div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="px-6 py-2.5 bg-surface-card hover:bg-surface-hover border border-border-light text-text-secondary rounded-lg text-sm transition-all duration-200 flex items-center gap-2"
            >
              <i className="bx bx-arrow-back" />
              Back to Home
            </Link>
            <button
              onClick={() => {
                if (isAuthenticated) {
                  router.push('/profile')
                } else {
                  const id = `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
                  router.push(`/c/${id}?new=1`)
                }
              }}
              className="px-6 py-2.5 bg-accent-blue hover:bg-accent-blue-hover text-white rounded-lg text-sm transition-all duration-200 flex items-center gap-2"
            >
              <i className="bx bx-palette" />
              {isAuthenticated ? 'My Canvases' : 'Open Canvas'}
            </button>
          </div>
        </motion.div>
      </main>

      <LandingFooter />
    </div>
  )
}
