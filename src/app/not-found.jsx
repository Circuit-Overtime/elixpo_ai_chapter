'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import LandingNav from '@/components/landing/LandingNav'
import LandingFooter from '@/components/landing/LandingFooter'

export default function NotFound() {
  const canvasRef = useRef(null)

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
      const cx = canvas.offsetWidth / 2
      const cy = canvas.offsetHeight / 2
      rc.rectangle(cx - 120, cy - 80, 240, 160, {
        stroke: '#5B57D1',
        strokeWidth: 2,
        roughness: 3,
        bowing: 2,
      })

      // X marks through it
      rc.line(cx - 80, cy - 40, cx - 30, cy + 40, { stroke: '#c873e4', strokeWidth: 1.5, roughness: 2.5 })
      rc.line(cx - 30, cy - 40, cx - 80, cy + 40, { stroke: '#c873e4', strokeWidth: 1.5, roughness: 2.5 })

      rc.line(cx + 30, cy - 40, cx + 80, cy + 40, { stroke: '#c873e4', strokeWidth: 1.5, roughness: 2.5 })
      rc.line(cx + 80, cy - 40, cx + 30, cy + 40, { stroke: '#c873e4', strokeWidth: 1.5, roughness: 2.5 })

      // Circle in the middle (the "0")
      rc.circle(cx, cy, 70, { stroke: '#444480', strokeWidth: 1.5, roughness: 2.5 })

      // Scattered doodles
      rc.circle(cx - 200, cy - 120, 30, { stroke: '#3a3a50', strokeWidth: 1, roughness: 3 })
      rc.rectangle(cx + 180, cy + 80, 50, 35, { stroke: '#3a3a50', strokeWidth: 1, roughness: 3 })
      rc.line(cx + 140, cy - 100, cx + 190, cy - 80, { stroke: '#444480', strokeWidth: 1, roughness: 2 })
    }

    draw()
    return () => { mounted = false }
  }, [])

  return (
    <div className="min-h-screen bg-[#120e1a] text-white font-[lixFont] overflow-x-hidden flex flex-col">
      <LandingNav />

      <main className="flex-1 flex items-center justify-center relative pt-16">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-25 pointer-events-none" />

        <div className="absolute top-1/3 left-1/3 w-72 h-72 bg-accent-blue/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 right-1/3 w-72 h-72 bg-accent/3 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center px-6 max-w-lg"
        >
          <motion.p
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-8xl md:text-9xl font-light text-accent-blue/100 mb-2 tracking-tighter"
          >
            404
          </motion.p>

          <h1 className="text-2xl md:text-3xl font-light mb-3 text-text-primary">
            This canvas is empty
          </h1>
          <p className="text-[#ccc] text-base mb-10 leading-relaxed">
            The page you're looking for doesn't exist, was moved, or was erased from the canvas.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="px-6 py-2.5 bg-surface-card hover:bg-surface-hover border border-border-light text-text-secondary rounded-lg text-sm transition-all duration-200 flex items-center gap-2"
            >
              <i className="bx bx-home" />
              Home
            </Link>
            <Link
              href={`/c/lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}
              className="px-6 py-2.5 bg-accent-blue hover:bg-accent-blue-hover text-white rounded-lg text-sm transition-all duration-200 flex items-center gap-2"
            >
              <i className="bx bx-palette" />
              New Canvas
            </Link>
          </div>
        </motion.div>
      </main>

      <LandingFooter />
    </div>
  )
}
