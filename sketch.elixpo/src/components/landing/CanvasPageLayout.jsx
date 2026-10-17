'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import MarkdownRenderer from '@/components/blog/MarkdownRenderer'

// ── Dot grid background ───────────────────────────────────────────────────────
function DotGrid({ className }) {
  return (
    <svg className={className} width="100%" height="100%">
      <defs>
        <pattern id="page-dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="0.8" fill="rgba(91, 87, 209, 0.15)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#page-dot-grid)" />
    </svg>
  )
}

// ── RoughJS frame ─────────────────────────────────────────────────────────────
function RoughFrame({ children, className }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted || !canvas) return

      const dpr = window.devicePixelRatio || 1
      const w = container.offsetWidth
      const h = container.offsetHeight

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)

      rc.rectangle(4, 4, w - 8, h - 8, {
        stroke: '#7667a8',
        strokeWidth: 1.2,
        roughness: 1.5,
        bowing: 0.8,
      })

      const cs = 12
      rc.line(2, cs + 2, 2, 2, { stroke: '#c873e4', strokeWidth: 1, roughness: 1 })
      rc.line(2, 2, cs + 2, 2, { stroke: '#c873e4', strokeWidth: 1, roughness: 1 })
      rc.line(w - cs - 2, 2, w - 2, 2, { stroke: '#c873e4', strokeWidth: 1, roughness: 1 })
      rc.line(w - 2, 2, w - 2, cs + 2, { stroke: '#c873e4', strokeWidth: 1, roughness: 1 })
      rc.line(2, h - cs - 2, 2, h - 2, { stroke: '#444480', strokeWidth: 1, roughness: 1 })
      rc.line(2, h - 2, cs + 2, h - 2, { stroke: '#444480', strokeWidth: 1, roughness: 1 })
      rc.line(w - cs - 2, h - 2, w - 2, h - 2, { stroke: '#444480', strokeWidth: 1, roughness: 1 })
      rc.line(w - 2, h - cs - 2, w - 2, h - 2, { stroke: '#444480', strokeWidth: 1, roughness: 1 })
    }

    const timer = setTimeout(draw, 50)
    return () => { mounted = false; clearTimeout(timer) }
  }, [])

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

// ── RoughJS underline ─────────────────────────────────────────────────────────
function RoughUnderline({ width = 300, color = '#7667a8' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = 8 * dpr
      canvas.style.width = width + 'px'
      canvas.style.height = '8px'

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)
      rc.line(0, 4, width, 4, {
        stroke: color,
        strokeWidth: 1.5,
        roughness: 2,
        bowing: 1.2,
      })
    }

    draw()
    return () => { mounted = false }
  }, [width, color])

  return <canvas ref={canvasRef} className="block mt-2 mb-4" />
}

// ── Margin doodles ────────────────────────────────────────────────────────────
function MarginDoodles() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true

    async function draw() {
      const rough = (await import('roughjs')).default
      if (!mounted) return

      const dpr = window.devicePixelRatio || 1
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight

      canvas.width = w * dpr
      canvas.height = h * dpr

      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const rc = rough.canvas(canvas)

      rc.circle(30, 120, 20, { stroke: '#7667a8', strokeWidth: 0.8, roughness: 2.5, fill: 'rgba(91,87,209,0.03)', fillStyle: 'solid' })
      rc.rectangle(w - 60, 200, 35, 25, { stroke: '#c873e4', strokeWidth: 0.8, roughness: 2 })
      rc.line(20, 350, 55, 340, { stroke: '#444480', strokeWidth: 0.8, roughness: 2 })
      rc.ellipse(w - 40, 500, 30, 18, { stroke: '#7667a8', strokeWidth: 0.7, roughness: 2.5 })
      rc.circle(35, 650, 14, { stroke: '#3a3a50', strokeWidth: 0.8, roughness: 3 })
      rc.rectangle(w - 55, 800, 28, 20, { stroke: '#444480', strokeWidth: 0.7, roughness: 2.5 })
      rc.line(25, 950, 50, 960, { stroke: '#c873e4', strokeWidth: 0.7, roughness: 2 })
      rc.circle(w - 35, 1100, 16, { stroke: '#3a3a50', strokeWidth: 0.7, roughness: 2.5 })
    }

    const timer = setTimeout(draw, 100)
    return () => { mounted = false; clearTimeout(timer) }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-40" />
}

/**
 * Reusable canvas-styled page layout.
 * Used by security, roadmap, how-to-start, use-cases, teams pages.
 *
 * Props:
 *  - title: page title
 *  - description: subtitle text
 *  - icon: boxicon class
 *  - tags: string[] for tag badges
 *  - breadcrumbs: [{ label, href? }]
 *  - backHref: back link destination
 *  - backLabel: back link text
 *  - content: raw markdown string
 */
export default function CanvasPageLayout({
  title,
  description,
  icon,
  tags = [],
  breadcrumbs = [],
  backHref = '/',
  backLabel = 'Back to Home',
  content,
}) {
  return (
    <div className="min-h-screen bg-[#120e1a] text-white font-[lixFont] relative">
      <DotGrid className="fixed inset-0 pointer-events-none opacity-60" />
      <MarginDoodles />

      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#120e1a]/90 backdrop-blur-xl border-b border-[#49385e]">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/?noredirect=1" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/icon.png" alt="LixSketch" className="w-7 h-7 rounded-md" />
              <span className="text-white font-medium font-[lixFont]">LixSketch</span>
            </Link>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-3">
                <span className="text-[#444480]">/</span>
                {crumb.href ? (
                  <Link href={crumb.href} className="text-[#a0a0b0] hover:text-white transition-colors font-[lixFont]">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-[#a0a0b0] font-[lixFont]">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
          <Link href={backHref} className="text-[#a0a0b0] text-sm hover:text-white transition-colors font-[lixFont]">
            <i className="bx bx-arrow-back mr-1" />
            {backLabel}
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto pt-24 pb-16 px-6 relative z-10">
        {/* Header frame */}
        <RoughFrame className="mb-10 p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#8B88E8]/10 border border-[#8B88E8]/20 flex items-center justify-center">
              <i className={`${icon} text-xl text-[#8B88E8]`} />
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 text-[10px] rounded-md bg-[#8B88E8]/8 border border-[#8B88E8]/15 text-[#8B88E8]/80 uppercase tracking-wider font-[lixFont]">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-[lixFont] text-white mb-2 leading-tight">{title}</h1>
          <RoughUnderline width={280} color="#8B88E8" />
          <p className="text-[#c9d1d9] text-lg leading-relaxed font-[lixFont]">{description}</p>
        </RoughFrame>

        {/* Markdown content */}
        <MarkdownRenderer content={content} canvasStyle />
      </div>
    </div>
  )
}
