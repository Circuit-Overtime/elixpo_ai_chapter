'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Link from 'next/link'
import LandingNav from '@/components/landing/LandingNav'
import LandingFooter from '@/components/landing/LandingFooter'
import useAuth from '@/hooks/useAuth'
import useAuthStore from '@/store/useAuthStore'
import {
  clearRememberedCanvasId,
  createCanvasSessionId,
  getRememberedCanvasId,
  hasLocalSavedWorkspace,
  hasStoredCanvasKey,
} from '@/utils/canvasSession'

// ── WebGL Particle Constellation ──────────────────────────────────────────────
// Lightweight dot-grid with faint connections. Runs at native RAF, ~0.5ms/frame.
const VERT = `
  attribute vec2 aPos;
  attribute float aAlpha;
  uniform vec2 uRes;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec2 clip = (aPos / uRes) * 2.0 - 1.0;
    clip.y *= -1.0;
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = 2.0;
  }
`
const FRAG = `
  precision mediump float;
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.4, d) * vAlpha;
    gl_FragColor = vec4(uColor, a);
  }
`
const LINE_VERT = `
  attribute vec2 aPos;
  attribute float aAlpha;
  uniform vec2 uRes;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec2 clip = (aPos / uRes) * 2.0 - 1.0;
    clip.y *= -1.0;
    gl_Position = vec4(clip, 0.0, 1.0);
  }
`
const LINE_FRAG = `
  precision mediump float;
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha * 0.15);
  }
`

function createShader(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return s
}
function createProgram(gl, vs, fs) {
  const p = gl.createProgram()
  gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  return p
}

function ParticleField({ className }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
    if (!gl) return

    let raf
    let mounted = true
    const dpr = Math.min(window.devicePixelRatio, 2)

    // Programs
    const dotProg = createProgram(gl, VERT, FRAG)
    const lineProg = createProgram(gl, LINE_VERT, LINE_FRAG)

    // Particle count scaled to viewport
    const COUNT = Math.min(80, Math.floor((window.innerWidth * window.innerHeight) / 12000))
    const CONNECT_DIST = 150

    // Init particles
    const particles = Array.from({ length: COUNT }, () => ({
      x: 0, y: 0,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: 0.2 + Math.random() * 0.5,
    }))

    function resize() {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)
      // Distribute particles
      particles.forEach(p => {
        if (p.x === 0 && p.y === 0) {
          p.x = Math.random() * w
          p.y = Math.random() * h
        }
      })
    }
    resize()
    window.addEventListener('resize', resize)

    // Buffers
    const dotBuf = gl.createBuffer()
    const lineBuf = gl.createBuffer()

    // Preallocate typed arrays
    const dotData = new Float32Array(COUNT * 3) // x, y, alpha per particle
    const lineData = new Float32Array(COUNT * COUNT * 6) // worst case

    function frame() {
      if (!mounted) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight

      // Update positions
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        p.x = Math.max(0, Math.min(w, p.x))
        p.y = Math.max(0, Math.min(h, p.y))
      }

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      // ── Draw connecting lines ──
      let li = 0
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECT_DIST) {
            const a = 1 - dist / CONNECT_DIST
            lineData[li++] = particles[i].x * dpr
            lineData[li++] = particles[i].y * dpr
            lineData[li++] = a
            lineData[li++] = particles[j].x * dpr
            lineData[li++] = particles[j].y * dpr
            lineData[li++] = a
          }
        }
      }
      if (li > 0) {
        gl.useProgram(lineProg)
        gl.uniform2f(gl.getUniformLocation(lineProg, 'uRes'), canvas.width, canvas.height)
        gl.uniform3f(gl.getUniformLocation(lineProg, 'uColor'), 0.545, 0.427, 0.878) // #8b6de0
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf)
        gl.bufferData(gl.ARRAY_BUFFER, lineData.subarray(0, li), gl.DYNAMIC_DRAW)
        const lPos = gl.getAttribLocation(lineProg, 'aPos')
        const lAlpha = gl.getAttribLocation(lineProg, 'aAlpha')
        gl.enableVertexAttribArray(lPos)
        gl.enableVertexAttribArray(lAlpha)
        gl.vertexAttribPointer(lPos, 2, gl.FLOAT, false, 12, 0)
        gl.vertexAttribPointer(lAlpha, 1, gl.FLOAT, false, 12, 8)
        gl.drawArrays(gl.LINES, 0, li / 3)
      }

      // ── Draw dots ──
      for (let i = 0; i < COUNT; i++) {
        dotData[i * 3] = particles[i].x * dpr
        dotData[i * 3 + 1] = particles[i].y * dpr
        dotData[i * 3 + 2] = particles[i].alpha
      }
      gl.useProgram(dotProg)
      gl.uniform2f(gl.getUniformLocation(dotProg, 'uRes'), canvas.width, canvas.height)
      gl.uniform3f(gl.getUniformLocation(dotProg, 'uColor'), 0.545, 0.427, 0.878)
      gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf)
      gl.bufferData(gl.ARRAY_BUFFER, dotData, gl.DYNAMIC_DRAW)
      const dPos = gl.getAttribLocation(dotProg, 'aPos')
      const dAlpha = gl.getAttribLocation(dotProg, 'aAlpha')
      gl.enableVertexAttribArray(dPos)
      gl.enableVertexAttribArray(dAlpha)
      gl.vertexAttribPointer(dPos, 2, gl.FLOAT, false, 12, 0)
      gl.vertexAttribPointer(dAlpha, 1, gl.FLOAT, false, 12, 8)
      gl.drawArrays(gl.POINTS, 0, COUNT)

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    return () => {
      mounted = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className={className} style={{ width: '100%', height: '100%' }} />
}

// ── Rough.js hand-drawn shape component ───────────────────────────────────────
function RoughCanvas({ className }) {
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
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight

      rc.rectangle(w * 0.05, h * 0.1, 120, 80, { stroke: '#5B57D1', strokeWidth: 1.5, roughness: 2 })
      rc.circle(w * 0.85, h * 0.15, 90, { stroke: '#c873e4', strokeWidth: 1.5, roughness: 2 })
      rc.line(w * 0.15, h * 0.85, w * 0.35, h * 0.75, { stroke: '#5B57D1', strokeWidth: 1.5, roughness: 2 })
      rc.ellipse(w * 0.75, h * 0.8, 140, 70, { stroke: '#444480', strokeWidth: 1.2, roughness: 2.5 })
      rc.rectangle(w * 0.45, h * 0.05, 80, 60, { stroke: '#3a3a50', strokeWidth: 1, roughness: 3 })
      rc.line(w * 0.6, h * 0.9, w * 0.9, h * 0.85, { stroke: '#c873e4', strokeWidth: 1, roughness: 2 })
      rc.linearPath([
        [w * 0.08, h * 0.55],
        [w * 0.18, h * 0.45],
        [w * 0.16, h * 0.47],
      ], { stroke: '#444480', strokeWidth: 1.2, roughness: 2 })
      rc.circle(w * 0.5, h * 0.92, 40, { stroke: '#3a3a50', strokeWidth: 1, roughness: 3 })
      rc.rectangle(w * 0.88, h * 0.45, 70, 50, { stroke: '#5B57D1', strokeWidth: 1, roughness: 2.5 })
    }

    draw()
    return () => { mounted = false }
  }, [])

  return <canvas ref={canvasRef} className={className} />
}

// ── Animation variants ────────────────────────────────────────────────────────
const blurUp = {
  hidden: { filter: 'blur(12px)', y: 30, opacity: 0 },
  visible: { filter: 'blur(0px)', y: 0, opacity: 1 },
}

const perspectiveTilt = {
  hidden: { rotateX: 12, scale: 0.92, opacity: 0, transformPerspective: 1200 },
  visible: { rotateX: 0, scale: 1, opacity: 1, transformPerspective: 1200 },
}

const slideReveal = {
  hidden: { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
  visible: { clipPath: 'inset(0 0% 0 0)', opacity: 1 },
}

const scaleSpring = {
  hidden: { scale: 0.6, opacity: 0 },
  visible: { scale: 1, opacity: 1 },
}

// ── Components ────────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, description, delay }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
      variants={blurUp}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative group"
    >
      <div className="bg-surface-card border border-border-light rounded-2xl p-6 h-full transition-all duration-300 hover:border-accent-blue/50 hover:bg-surface/80">
        <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center mb-4 text-accent-blue text-xl">
          <i className={icon} />
        </div>
        <h3 className="text-text-primary text-base font-medium mb-2">{title}</h3>
        <p className="text-text-dim text-sm leading-relaxed">{description}</p>
      </div>
    </motion.div>
  )
}

function ToolbarPreview() {
  const tools = [
    { icon: 'bx-pointer', label: 'Select' },
    { icon: 'bx-move', label: 'Pan' },
    { icon: 'bx-rectangle', label: 'Rectangle' },
    { icon: 'bx-circle', label: 'Circle' },
    { icon: 'bx-minus', label: 'Line' },
    { icon: 'bx-right-top-arrow-circle', label: 'Arrow' },
    { icon: 'bx-pencil', label: 'Draw' },
    { icon: 'bx-text', label: 'Text' },
    { icon: 'bx-code-block', label: 'Code' },
    { icon: 'bx-image', label: 'Image' },
  ]

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={slideReveal}
      transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
      className="flex flex-col gap-1.5 bg-surface rounded-xl p-2 w-fit shadow-2xl border border-border-light"
    >
      {tools.map((tool, i) => (
        <motion.div
          key={tool.label}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={scaleSpring}
          transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.5 + i * 0.06 }}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-accent hover:bg-surface-hover transition-all duration-200 cursor-default"
          title={tool.label}
        >
          <i className={`bx ${tool.icon} text-lg`} />
        </motion.div>
      ))}
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  // Process auth callback params (auth_token, auth_user) from OAuth redirect
  useAuth()

  const { scrollYProgress } = useScroll()
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.92])
  const heroBlur = useTransform(scrollYProgress, [0, 0.15], [0, 8])
  const heroFilter = useTransform(heroBlur, v => `blur(${v}px)`)
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, -40])

  const [newSessionId, setNewSessionId] = useState('')
  const [checkingSavedCanvas, setCheckingSavedCanvas] = useState(true)
  useEffect(() => {
    // The auth callback owns navigation when sign-in started from a canvas.
    if (window.__lixAuthRedirecting) return

    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const showLandingPage = () => {
      if (cancelled) return
      setNewSessionId(createCanvasSessionId())
      setCheckingSavedCanvas(false)
    }

    // An explicit logo click is a request to see the landing page. Normal
    // visits still resume the last restorable canvas below.
    if (new URLSearchParams(window.location.search).has('noredirect')) {
      clearTimeout(timeout)
      showLandingPage()
      return () => {
        cancelled = true
        controller.abort()
      }
    }

    const restoreRememberedCanvas = async () => {
      const rememberedCanvasId = getRememberedCanvasId()
      if (!rememberedCanvasId) {
        clearRememberedCanvasId()
        showLandingPage()
        return
      }

      if (hasLocalSavedWorkspace(rememberedCanvasId)) {
        window.location.replace(`/c/${encodeURIComponent(rememberedCanvasId)}`)
        return
      }

      // A cloud-saved canvas can outlive its local scene buffer. Resume it
      // only when this browser still has the E2E key required to decrypt it.
      try {
        const response = await fetch(`/api/scenes/load?sessionId=${encodeURIComponent(rememberedCanvasId)}&touch=0`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const savedWorkspace = response.ok ? await response.json() : null
        if (savedWorkspace?.encryptedData && hasStoredCanvasKey(rememberedCanvasId)) {
          window.location.replace(`/c/${encodeURIComponent(rememberedCanvasId)}`)
          return
        }
        if (savedWorkspace?.missing || (savedWorkspace?.encryptedData && !hasStoredCanvasKey(rememberedCanvasId))) {
          clearRememberedCanvasId(rememberedCanvasId)
        }
      } catch {
        // Keep the pointer on transient network failure so a later visit can retry.
      }

      showLandingPage()
    }

    restoreRememberedCanvas()
    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  if (checkingSavedCanvas) {
    return (
      <div className="min-h-screen bg-[#120e1a] text-white flex items-center justify-center font-[lixFont]">
        <i className="bx bx-loader-alt animate-spin text-2xl text-accent-blue" aria-label="Checking saved canvas" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#120e1a] text-white font-[lixFont] overflow-x-hidden">
      <LandingNav />

      {/* Hero Section */}
      <motion.section
        style={{
          scale: heroScale,
          y: heroY,
          filter: heroFilter,
        }}
        className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden"
      >
        {/* WebGL particle constellation background */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <ParticleField className="absolute inset-0" />
        </div>

        <RoughCanvas className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" />

        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-blue/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 text-center px-6 mt-4 max-w-4xl mx-auto">
          {/* Badge — slide in from left with clip-path */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={slideReveal}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-light bg-surface-card/50 text-text-dim text-xs mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Open Source &middot; No Account Required
          </motion.div>

          {/* Headline — blur defogging reveal */}
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={blurUp}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-5xl md:text-7xl font-light tracking-tight leading-tight mb-6"
          >
            Sketch your ideas.
            <br />
            <span className="text-accent-blue">Ship them faster.</span>
          </motion.h1>

          {/* Subtitle — blur up */}
          <motion.p
            initial="hidden"
            animate="visible"
            variants={blurUp}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-text-muted text-lg md:text-xl max-w-2xl mx-auto mb-6 leading-relaxed font-light"
          >
            An open-source WYSIWYG canvas for diagrams, wireframes, and docs.
            Hand-drawn aesthetic. Infinite canvas. Zero friction.
          </motion.p>

          {/* Powered-by chip — credits the lixeditor package shipped on npm */}
          <motion.a
            href="https://www.npmjs.com/package/@elixpo/lixeditor"
            target="_blank"
            rel="noopener noreferrer"
            initial="hidden"
            animate="visible"
            variants={blurUp}
            transition={{ duration: 0.7, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-10 rounded-full bg-surface-card/60 backdrop-blur-sm border border-border-light/70 text-text-muted hover:text-text-primary hover:border-accent-blue/40 transition-all duration-200 text-xs"
          >
            <i className="bx bx-package text-sm text-accent-blue" />
            <span>Doc editor powered by</span>
            <code className="text-accent-blue font-mono">@elixpo/lixeditor</code>
            <span className="text-text-dim">on npm</span>
            <i className="bx bx-link-external text-xs opacity-60" />
          </motion.a>

          {/* Buttons — spring scale */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={scaleSpring}
            transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.7 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href={newSessionId ? `/c/${newSessionId}?new=1&preserveLocal=1` : '#'}
              className={`px-8 py-3.5 bg-accent-blue hover:bg-accent-blue-hover text-white rounded-xl text-base transition-all duration-200 hover:shadow-xl hover:shadow-accent-blue/25 flex items-center gap-2 ${!newSessionId ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <i className="bx bx-palette text-xl" />
              Start Drawing
            </Link>
            <Link
              href="/docs"
              className="px-8 py-3.5 bg-surface-card hover:bg-surface-hover border border-border-light text-text-secondary rounded-xl text-base transition-all duration-200 flex items-center gap-2"
            >
              <i className="bx bx-book-open text-xl" />
              LixScript Docs
            </Link>
          </motion.div>

          {/* Canvas preview — 3D perspective tilt */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={perspectiveTilt}
            transition={{ duration: 1, delay: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mt-16 relative max-w-3xl mx-auto"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div className="bg-surface-dark rounded-2xl border border-border-light overflow-hidden shadow-2xl shadow-black/50">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-light bg-surface-dark">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                </div>
                <span className="text-text-dim text-xs ml-2">LixSketch &mdash; Untitled Canvas</span>
              </div>
              <div className="relative h-72 md:h-80 bg-[#171120]">
                <RoughCanvas className="absolute inset-0 w-full h-full opacity-60" />
                <div className="absolute left-3 top-3">
                  <ToolbarPreview />
                </div>
              </div>
            </div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-accent-blue/10 blur-3xl rounded-full" />
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-5 h-8 rounded-full border border-text-dim/30 flex items-start justify-center p-1.5"
          >
            <div className="w-1 h-1.5 rounded-full bg-text-dim" />
          </motion.div>
        </motion.div>
      </motion.section>


    {/* NPM Package & VS Code Extension */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#8B88E8]/[0.02] to-transparent pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={blurUp}
            transition={{ duration: 0.6 }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-light mb-4">
              Use it anywhere
            </h2>
            <p className="text-text-dim text-base max-w-xl mx-auto">
              Embed the engine in your app or draw diagrams right inside VS Code.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* NPM Package */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={blurUp}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <Link
                href="/resources/npm-package"
                className="block group bg-surface-card/60 border border-border-light rounded-2xl p-8 h-full transition-all duration-300 hover:border-accent-blue/40 hover:bg-surface-card/80"
              >
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <i className="bx bxl-nodejs text-2xl text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-text-primary text-lg font-medium group-hover:text-accent-blue transition-colors">NPM Package</h3>
                    <p className="text-text-dim text-xs">@elixpo/lixsketch</p>
                  </div>
                </div>
                <p className="text-text-muted text-sm leading-relaxed mb-5">
                  Mount a full infinite canvas on any SVG element. Works with React, Vue, Svelte, or plain HTML.
                </p>
                <div className="bg-[#171120] rounded-lg border border-white/[0.06] px-4 py-3">
                  <code className="text-green-400 text-sm font-[lixCode]">npm install @elixpo/lixsketch</code>
                </div>
              </Link>
            </motion.div>

            {/* VS Code Extension */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={blurUp}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Link
                href="/resources/vscode-extension"
                className="block group bg-surface-card/60 border border-border-light rounded-2xl p-8 h-full transition-all duration-300 hover:border-accent-blue/40 hover:bg-surface-card/80"
              >
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <i className="bx bxl-visual-studio text-2xl text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-text-primary text-lg font-medium group-hover:text-accent-blue transition-colors">VS Code Extension</h3>
                    <p className="text-text-dim text-xs">LixSketch for VS Code</p>
                  </div>
                </div>
                <p className="text-text-muted text-sm leading-relaxed mb-5">
                  Draw diagrams inside your editor. Full canvas tab, LixScript syntax highlighting, and live preview.
                </p>
                <div className="bg-[#171120] rounded-lg border border-white/[0.06] px-4 py-3">
                  <code className="text-blue-400 text-sm font-[lixCode]">https://marketplace.visualstudio.com/items?itemName=elixpo.lixsketch</code>
                </div>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={blurUp}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-light mb-4">
              Everything you need to <span className="text-accent">think visually</span>
            </h2>
            <p className="text-text-dim text-base max-w-xl mx-auto">
              A canvas that feels like a whiteboard but works like a design tool.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon="bx bx-pen"
              title="Hand-Drawn Aesthetic"
              description="RoughJS-powered shapes give everything a natural, sketchy feel. Perfect for early-stage thinking."
              delay={0}
            />
            <FeatureCard
              icon="bx bx-expand"
              title="Infinite Canvas"
              description="Pan, zoom, and draw without limits. From 0.4x to 30x zoom with smooth controls."
              delay={0.1}
            />
            <FeatureCard
              icon="bx bx-code-block"
              title="Code Blocks"
              description="Drop syntax-highlighted code blocks right on the canvas with language detection."
              delay={0.2}
            />
            <FeatureCard
              icon="bx bx-link-alt"
              title="Smart Arrows"
              description="Arrows auto-attach to shapes and follow them when moved. Connect ideas effortlessly."
              delay={0}
            />
            <FeatureCard
              icon="bx bx-lock-alt"
              title="E2E Encrypted Sharing"
              description="Share your canvas with a link. The encryption key stays in the URL fragment, never hits the server."
              delay={0.1}
            />
            <FeatureCard
              icon="bx bx-brain"
              title="AI Diagram Generation"
              description="Describe what you want in plain text or LixScript. The AI builds the diagram for you."
              delay={0.2}
            />
            <FeatureCard
              icon="bx bx-export"
              title="Export Anywhere"
              description="Export your work as PNG or SVG. Clean output, ready for docs, decks, or READMEs."
              delay={0}
            />
            <FeatureCard
              icon="bx bx-command"
              title="Command Palette"
              description="Keyboard-first workflow. Hit Cmd+K to search tools, actions, and shortcuts."
              delay={0.1}
            />
            <FeatureCard
              icon="bx bx-group"
              title="Real-time Collaboration"
              description="Work together on the same canvas in real time. See cursors, edits, and changes live."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section id="tools" className="py-32 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent-blue/3 to-transparent pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={blurUp}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-light mb-4">
              Tools that get out of your way
            </h2>
            <p className="text-text-dim text-base max-w-xl mx-auto">
              Every shape, line, and text block is one click away. No menus to dig through.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: 'bx-rectangle', name: 'Rectangles', color: 'text-blue-400' },
              { icon: 'bx-circle', name: 'Circles', color: 'text-purple-400' },
              { icon: 'bx-right-top-arrow-circle', name: 'Arrows', color: 'text-pink-400' },
              { icon: 'bx-minus', name: 'Lines', color: 'text-cyan-400' },
              { icon: 'bx-pencil', name: 'Freehand', color: 'text-amber-400' },
              { icon: 'bx-text', name: 'Text', color: 'text-green-400' },
              { icon: 'bx-code-block', name: 'Code', color: 'text-orange-400' },
              { icon: 'bx-image', name: 'Images', color: 'text-teal-400' },
            ].map((tool, i) => (
              <motion.div
                key={tool.name}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={scaleSpring}
                transition={{ type: 'spring', stiffness: 350, damping: 20, delay: i * 0.06 }}
                className="bg-surface-card/60 border border-border-light rounded-xl p-5 flex flex-col items-center gap-3 hover:border-accent-blue/30 transition-all duration-200"
              >
                <i className={`bx ${tool.icon} text-3xl ${tool.color}`} />
                <span className="text-text-secondary text-sm">{tool.name}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={perspectiveTilt}
          transition={{ duration: 0.8 }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-5xl font-light mb-6">
            Ready to sketch?
          </h2>
          <p className="text-text-dim text-lg mb-10 max-w-xl mx-auto">
            No sign-up. No paywall. Just open the canvas and start creating.
          </p>
          <Link
            href={newSessionId ? `/c/${newSessionId}?new=1&preserveLocal=1` : '#'}
            className={`inline-flex items-center gap-2 px-10 py-4 bg-accent-blue hover:bg-accent-blue-hover text-white rounded-xl text-lg transition-all duration-200 hover:shadow-xl hover:shadow-accent-blue/25 ${!newSessionId ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <i className="bx bx-palette text-2xl" />
            Launch Canvas
          </Link>
        </motion.div>
      </section>

      
     

      {/* InkFlowa v1 Showcase */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#8B88E8]/[0.03] to-transparent pointer-events-none" />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={blurUp}
          transition={{ duration: 0.7 }}
          className="max-w-4xl mx-auto relative z-10"
        >
          <div className="bg-surface-card/40 border border-border-light rounded-2xl p-8 md:p-10 backdrop-blur-sm">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#8B88E8]/20 bg-[#8B88E8]/5 text-[#8B88E8] text-xs mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8B88E8]" />
                  Our v1 Product
                </div>
                <h3 className="text-2xl md:text-3xl font-light text-text-primary mb-3">
                  InkFlow
                </h3>
                <p className="text-text-muted text-sm md:text-base leading-relaxed mb-6 max-w-md">
                  Where it all started. InkFlow was our first take at a canvas — the foundation that led to LixSketch. Check out the original.
                </p>
                <a
                  href="https://inkflowa.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#8B88E8]/10 hover:bg-[#8B88E8]/20 border border-[#8B88E8]/30 text-[#8B88E8] rounded-xl text-sm transition-all duration-200 hover:shadow-lg hover:shadow-[#8B88E8]/10"
                >
                  <i className="bx bx-link-external text-lg" />
                  Visit InkFlow
                </a>
              </div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={perspectiveTilt}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="w-full md:w-[320px] shrink-0"
              >
                <div className="bg-surface-dark rounded-xl border border-border-light overflow-hidden shadow-xl">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-light">
                    <div className="w-2 h-2 rounded-full bg-red-400/50" />
                    <div className="w-2 h-2 rounded-full bg-yellow-400/50" />
                    <div className="w-2 h-2 rounded-full bg-green-400/50" />
                    <span className="text-text-dim text-[10px] ml-1.5">inkflowa.vercel.app</span>
                  </div>
                  <div className="h-44 bg-[#171120] flex items-center justify-center relative overflow-hidden">
                    <RoughCanvas className="absolute inset-0 w-full h-full opacity-40" />
                    <div className="relative z-10 text-center">
                      <i className="bx bx-pen text-4xl text-[#8B88E8]/60 mb-2" />
                      <p className="text-text-dim text-xs">InkFlowa v1</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      <FeaturedTemplates />

      <LandingFooter />
    </div>
  )
}

function FeaturedTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/templates?limit=3')
      .then((res) => res.json())
      .then((data) => {
        setTemplates(data.templates || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading || !templates.length) return null

  return (
    <section className="py-24 border-t border-border-light bg-[#171324]/30 font-[lixFont]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-light leading-tight tracking-tight text-white">
              Recommended <span className="text-accent-blue">Templates</span>
            </h2>
            <p className="text-text-muted mt-2 text-sm leading-relaxed max-w-md">
              Start with one of these public workspaces published by the LixSketch community.
            </p>
          </div>
          <Link
            href="/templates"
            className="inline-flex items-center gap-1 text-sm text-accent-blue hover:underline"
          >
            Browse all templates <i className="bx bx-right-arrow-alt" />
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/templates/${template.slug}`}
              className="group rounded-2xl border border-border-light bg-surface-card/30 p-5 transition-all duration-300 hover:border-accent-blue/40 hover:bg-surface-card/60 flex flex-col h-full"
            >
              <div className="overflow-hidden rounded-xl border border-border-light bg-gradient-to-br from-[#2c2142]/40 to-[#111019] aspect-[16/9] mb-4 flex items-center justify-center relative">
                {template.coverDataUrl ? (
                  <img
                    src={template.coverDataUrl}
                    alt=""
                    className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.02]"
                  />
                ) : (
                  <i className="bx bx-palette text-5xl text-accent-blue/30" />
                )}
              </div>
              <h3 className="text-base font-medium text-text-primary group-hover:text-accent-blue transition duration-200 truncate">
                {template.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-text-muted line-clamp-2 flex-grow">
                {template.description || 'A public LixSketch workspace template.'}
              </p>
              <div className="mt-4 pt-4 border-t border-border-light/40 flex items-center justify-between text-[10px] text-text-dim">
                <span>By {template.publisher?.name || 'Community'}</span>
                <span>{template.forks || 0} forks</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
