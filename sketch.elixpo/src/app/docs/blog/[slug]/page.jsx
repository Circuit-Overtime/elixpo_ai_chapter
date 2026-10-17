'use client'

import { useParams } from 'next/navigation'
import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getBlogPost, blogPosts } from '@/content/blog'
import MarkdownRenderer from '@/components/blog/MarkdownRenderer'

// Raw markdown imports
// NOTE: dynamic import by slug isn't possible because Turbopack /
// webpack need static specifiers to bundle the content. Each new post
// gets a static import line + a contentMap entry below — keep them in
// sync with src/content/blog/index.js.
import enginePackageLaunch from '@/content/blog/engine-package-launch.md'
import e2eEncryption from '@/content/blog/e2e-encryption.md'
import websocketCollaboration from '@/content/blog/websocket-collaboration.md'
import lixscriptDsl from '@/content/blog/lixscript-dsl.md'
import roughjsCanvas from '@/content/blog/roughjs-canvas.md'
import imagePipeline from '@/content/blog/image-pipeline.md'
import lixeditorIntegration from '@/content/blog/lixeditor-integration.md'

const contentMap = {
  'engine-package-launch': enginePackageLaunch,
  'e2e-encryption': e2eEncryption,
  'websocket-collaboration': websocketCollaboration,
  'lixscript-dsl': lixscriptDsl,
  'roughjs-canvas': roughjsCanvas,
  'image-pipeline': imagePipeline,
  'lixeditor-integration': lixeditorIntegration,
}

// ── Dot grid background (matches canvas feel) ────────────────────────────────
function DotGrid({ className }) {
  return (
    <svg className={className} width="100%" height="100%">
      <defs>
        <pattern id="blog-dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="0.8" fill="rgba(91, 87, 209, 0.15)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#blog-dot-grid)" />
    </svg>
  )
}

// ── RoughJS frame around content (like a canvas frame/artboard) ───────────────
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

      // Main frame border — hand-drawn rectangle
      rc.rectangle(4, 4, w - 8, h - 8, {
        stroke: '#5B57D1',
        strokeWidth: 1.2,
        roughness: 1.5,
        bowing: 0.8,
      })

      // Corner decorations — small sketched marks
      const cornerSize = 12
      // Top-left
      rc.line(2, cornerSize + 2, 2, 2, { stroke: '#c873e4', strokeWidth: 1, roughness: 1 })
      rc.line(2, 2, cornerSize + 2, 2, { stroke: '#c873e4', strokeWidth: 1, roughness: 1 })
      // Top-right
      rc.line(w - cornerSize - 2, 2, w - 2, 2, { stroke: '#c873e4', strokeWidth: 1, roughness: 1 })
      rc.line(w - 2, 2, w - 2, cornerSize + 2, { stroke: '#c873e4', strokeWidth: 1, roughness: 1 })
      // Bottom-left
      rc.line(2, h - cornerSize - 2, 2, h - 2, { stroke: '#444480', strokeWidth: 1, roughness: 1 })
      rc.line(2, h - 2, cornerSize + 2, h - 2, { stroke: '#444480', strokeWidth: 1, roughness: 1 })
      // Bottom-right
      rc.line(w - cornerSize - 2, h - 2, w - 2, h - 2, { stroke: '#444480', strokeWidth: 1, roughness: 1 })
      rc.line(w - 2, h - cornerSize - 2, w - 2, h - 2, { stroke: '#444480', strokeWidth: 1, roughness: 1 })
    }

    // Wait a tick for layout
    const timer = setTimeout(draw, 50)
    return () => { mounted = false; clearTimeout(timer) }
  }, [])

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

// ── RoughJS title underline ───────────────────────────────────────────────────
function RoughUnderline({ width = 300, color = '#5B57D1' }) {
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

// ── Scattered decorative shapes in margin ─────────────────────────────────────
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

      // Scattered hand-drawn shapes along the margins
      rc.circle(30, 120, 20, { stroke: '#5B57D1', strokeWidth: 0.8, roughness: 2.5, fill: 'rgba(91,87,209,0.03)', fillStyle: 'solid' })
      rc.rectangle(w - 60, 200, 35, 25, { stroke: '#c873e4', strokeWidth: 0.8, roughness: 2 })
      rc.line(20, 350, 55, 340, { stroke: '#444480', strokeWidth: 0.8, roughness: 2 })
      rc.ellipse(w - 40, 500, 30, 18, { stroke: '#5B57D1', strokeWidth: 0.7, roughness: 2.5 })
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

export default function BlogPostPage() {
  const { slug } = useParams()
  const post = getBlogPost(slug)
  const content = contentMap[slug]

  if (!post || !content) {
    return (
      <div className="min-h-screen bg-[#120e1a] text-text-primary font-[lixFont] flex items-center justify-center">
        <div className="text-center">
          <i className="bx bx-error-circle text-4xl text-text-dim mb-3" />
          <h1 className="text-xl font-medium mb-2">Post Not Found</h1>
          <p className="text-text-dim text-sm mb-6">This blog post doesn't exist.</p>
          <Link href="/docs" className="text-accent-blue text-sm hover:underline">Back to Docs</Link>
        </div>
      </div>
    )
  }

  const currentIndex = blogPosts.findIndex(p => p.slug === slug)
  const prevPost = currentIndex > 0 ? blogPosts[currentIndex - 1] : null
  const nextPost = currentIndex < blogPosts.length - 1 ? blogPosts[currentIndex + 1] : null

  return (
    <div className="min-h-screen bg-[#120e1a] text-white font-[lixFont] relative">
      {/* Canvas dot grid background */}
      <DotGrid className="fixed inset-0 pointer-events-none opacity-60" />

      {/* Margin doodles */}
      <MarginDoodles />

      {/* Top bar — canvas toolbar style */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#120e1a]/90 backdrop-blur-xl border-b border-[#49385e]">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/?noredirect=1" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/icon.png" alt="LixSketch" className="w-7 h-7 rounded-md" />
              <span className="text-white font-medium font-[lixFont]">LixSketch</span>
            </Link>
            <span className="text-[#444480]">/</span>
            <Link href="/docs" className="text-[#a0a0b0] hover:text-white transition-colors font-[lixFont]">Docs</Link>
            <span className="text-[#444480]">/</span>
            <span className="text-[#a0a0b0] font-[lixFont]">Blog</span>
          </div>
          <Link href="/docs" className="text-[#a0a0b0] text-sm hover:text-white transition-colors font-[lixFont]">
            <i className="bx bx-arrow-back mr-1" />
            Back to Docs
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto pt-24 pb-16 px-6 relative z-10">
        {/* Post header — inside a rough frame */}
        <RoughFrame className="mb-10 p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#8B88E8]/10 border border-[#8B88E8]/20 flex items-center justify-center">
              <i className={`${post.icon} text-xl text-[#8B88E8]`} />
            </div>
            <div className="flex flex-wrap gap-2">
              {post.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 text-[10px] rounded-md bg-[#8B88E8]/8 border border-[#8B88E8]/15 text-[#8B88E8]/80 uppercase tracking-wider font-[lixFont]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {/* Title rendered like canvas text — lixFont, white, large */}
          <h1 className="text-3xl md:text-4xl font-[lixFont] text-white mb-2 leading-tight">{post.title}</h1>
          <RoughUnderline width={280} color="#8B88E8" />
          <p className="text-[#c9d1d9] text-lg leading-relaxed font-[lixFont]">{post.description}</p>
          <p className="text-[#444480] text-xs mt-4 font-[lixFont]">
            {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </RoughFrame>

        {/* Content — canvas-styled markdown */}
        <MarkdownRenderer content={content} canvasStyle />

        {/* Prev / Next navigation — canvas frame style */}
        <div className="mt-16 pt-8 border-t border-[#30363d] grid grid-cols-1 sm:grid-cols-2 gap-4">
          {prevPost ? (
            <Link
              href={`/docs/blog/${prevPost.slug}`}
              className="group p-4 rounded-xl border border-[#30363d] hover:border-[#5B57D1]/40 bg-[#161b22]/50 transition-all"
            >
              <p className="text-[#444480] text-[10px] uppercase tracking-wider mb-1 font-[lixFont]">Previous</p>
              <p className="text-[#c9d1d9] text-sm group-hover:text-[#5B57D1] transition-colors font-[lixFont]">{prevPost.title}</p>
            </Link>
          ) : <div />}
          {nextPost ? (
            <Link
              href={`/docs/blog/${nextPost.slug}`}
              className="group p-4 rounded-xl border border-[#30363d] hover:border-[#5B57D1]/40 bg-[#161b22]/50 transition-all text-right"
            >
              <p className="text-[#444480] text-[10px] uppercase tracking-wider mb-1 font-[lixFont]">Next</p>
              <p className="text-[#c9d1d9] text-sm group-hover:text-[#5B57D1] transition-colors font-[lixFont]">{nextPost.title}</p>
            </Link>
          ) : <div />}
        </div>
      </div>
    </div>
  )
}
