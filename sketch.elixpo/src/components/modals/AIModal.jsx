"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import useUIStore from '@/store/useUIStore'
import useAuthStore from '@/store/useAuthStore'
import { WORKER_URL } from '@/lib/env'

function DiagramLoadingAnimation({ color = '#4A90D9' }) {
  const c2 = color === '#4A90D9' ? '#9B59B6' : '#4A90D9'
  const c3 = '#2ECC71'
  return (
    <div className="flex flex-col items-center justify-center gap-5">
      <style>{`
        @keyframes dg-glob {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
          25% { transform: translate(12px, -8px) scale(1.15); opacity: 0.9; }
          50% { transform: translate(-6px, 10px) scale(0.9); opacity: 0.6; }
          75% { transform: translate(-10px, -5px) scale(1.1); opacity: 0.85; }
        }
        @keyframes dg-glob-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
          25% { transform: translate(-10px, 6px) scale(1.1); opacity: 0.85; }
          50% { transform: translate(8px, -10px) scale(0.95); opacity: 0.7; }
          75% { transform: translate(6px, 8px) scale(1.15); opacity: 0.9; }
        }
        @keyframes dg-glob-3 {
          0%, 100% { transform: translate(0, 0) scale(1.05); opacity: 0.65; }
          25% { transform: translate(8px, 10px) scale(0.9); opacity: 0.8; }
          50% { transform: translate(-12px, -4px) scale(1.1); opacity: 0.55; }
          75% { transform: translate(4px, -12px) scale(1); opacity: 0.9; }
        }
        @keyframes dg-icon-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}</style>
      <div className="relative w-20 h-20">
        <div className="absolute rounded-full" style={{
          width: 38, height: 38, top: 2, left: 2,
          background: `radial-gradient(circle, ${color}99 0%, transparent 70%)`,
          filter: 'blur(10px)', animation: 'dg-glob 3.5s ease-in-out infinite', willChange: 'transform, opacity',
        }} />
        <div className="absolute rounded-full" style={{
          width: 34, height: 34, top: 14, right: 0,
          background: `radial-gradient(circle, ${c2}8C 0%, transparent 70%)`,
          filter: 'blur(10px)', animation: 'dg-glob-2 4s ease-in-out infinite', willChange: 'transform, opacity',
        }} />
        <div className="absolute rounded-full" style={{
          width: 32, height: 32, bottom: 0, left: 10,
          background: `radial-gradient(circle, ${c3}80 0%, transparent 70%)`,
          filter: 'blur(10px)', animation: 'dg-glob-3 3.8s ease-in-out infinite', willChange: 'transform, opacity',
        }} />
        <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'dg-icon-float 2.5s ease-in-out infinite' }}>
          <div className="w-9 h-9 rounded-lg bg-black/30 backdrop-blur-sm border border-white/[0.08] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <line x1="10" y1="6.5" x2="14" y2="6.5" />
              <line x1="6.5" y1="10" x2="6.5" y2="14" />
              <line x1="14" y1="17.5" x2="10" y2="17.5" />
            </svg>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: color, animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: c2, animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: c3, animationDelay: '300ms' }} />
      </div>
      <p className="text-text-dim text-sm">Generating diagram...</p>
    </div>
  )
}

const GRAPH_COLORS = [
  '#4A90D9', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#3498DB', '#E91E63', '#00BCD4',
]

// Floating toast that shows AI generation progress
function AIToast({ status, message, onDismiss }) {
  if (!status) return null
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[10000] animate-slide-up font-[lixFont]">
      <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 ${
        status === 'loading' ? 'bg-surface-card/90 border-accent-blue/30'
        : status === 'success' ? 'bg-surface-card/90 border-green-500/30'
        : 'bg-surface-card/90 border-red-500/30'
      }`}>
        {status === 'loading' && (
          <>
            <div className="relative w-5 h-5">
              <div className="absolute inset-0 rounded-full border-2 border-accent-blue/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-blue animate-spin" />
            </div>
            <span className="text-text-primary text-sm">Generating diagram...</span>
          </>
        )}
        {status === 'success' && (
          <>
            <i className="bx bx-check-circle text-green-400 text-lg" />
            <span className="text-text-primary text-sm">Placed on canvas</span>
          </>
        )}
        {status === 'error' && (
          <>
            <i className="bx bx-error-circle text-red-400 text-lg" />
            <span className="text-red-300 text-sm">{message}</span>
            <button onClick={onDismiss} className="text-text-dim hover:text-text-primary ml-1">
              <i className="bx bx-x text-base" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// Zoomable + pannable SVG preview
function DiagramPreview({ svgMarkup, className }) {
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [svgMarkup])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.3, Math.min(3, z * delta)))
  }, [])

  // Use refs to avoid circular useCallback dependencies between move/up/down
  const handleMouseMoveRef = useRef(null)
  const handleMouseUpRef = useRef(null)

  handleMouseMoveRef.current = (e) => {
    if (!isPanningRef.current) return
    setPan(p => ({ x: p.x + e.clientX - lastPosRef.current.x, y: p.y + e.clientY - lastPosRef.current.y }))
    lastPosRef.current = { x: e.clientX, y: e.clientY }
  }

  handleMouseUpRef.current = () => {
    isPanningRef.current = false
    document.removeEventListener('mousemove', stableMouseMove)
    document.removeEventListener('mouseup', stableMouseUp)
  }

  // Stable references that delegate to the ref — never stale, never recreated
  const [stableMouseMove] = useState(() => (e) => handleMouseMoveRef.current(e))
  const [stableMouseUp] = useState(() => () => handleMouseUpRef.current())

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    isPanningRef.current = true
    lastPosRef.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
    // Attach to document so dragging works even when mouse leaves the preview area
    document.addEventListener('mousemove', stableMouseMove)
    document.addEventListener('mouseup', stableMouseUp)
  }, [stableMouseMove, stableMouseUp])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', handleWheel)
      document.removeEventListener('mousemove', stableMouseMove)
      document.removeEventListener('mouseup', stableMouseUp)
    }
  }, [handleWheel, stableMouseMove, stableMouseUp])

  if (!svgMarkup) return null

  return (
    <div
      ref={containerRef}
      className={`rounded-xl bg-surface-dark border border-border-light overflow-hidden relative select-none ${className || 'w-full h-[clamp(200px,40vh,400px)]'}`}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {/* Transparent overlay to capture all drag/pan events above the SVG */}
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{ zIndex: 1 }}
        onMouseDown={handleMouseDown}
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-surface-card border border-border-light shadow-md rounded-lg px-1.5 py-0.5" style={{ zIndex: 2 }}>
        <button onClick={() => setZoom(z => Math.max(0.3, z * 0.8))} className="text-text-secondary hover:text-text-primary text-xs px-1">-</button>
        <span className="text-text-secondary text-[10px] w-8 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="text-text-secondary hover:text-text-primary text-xs px-1">+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="text-text-secondary hover:text-text-primary text-[10px] px-1 border-l border-border-light ml-0.5 pl-1.5">Reset</button>
      </div>
    </div>
  )
}

export default function AIModal() {
  const aiModalOpen = useUIStore((s) => s.aiModalOpen)
  const toggleAIModal = useUIStore((s) => s.toggleAIModal)
  const resolvedTheme = useUIStore((s) => s.resolvedTheme)

  // Hides every "Describe with AI" prompt block. The visual scaffolding
  // (modal shell, tabs, code editors, preview panes, render buttons) stays
  // intact and runs purely client-side through the engine's local parsers.
  // Re-enable by flipping to false once AI inference is back online.
  const AI_DISABLED = true

  const [mode, setMode] = useState('code')
  const [prompt, setPrompt] = useState('')
  const [toast, setToast] = useState({ status: null, message: '' })

  // Diagram preview state
  const [previewDiagram, setPreviewDiagram] = useState(null)
  const [previewSVG, setPreviewSVG] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [editPrompt, setEditPrompt] = useState('')
  const [chatHistory, setChatHistory] = useState([])

  // AI quota state
  const [aiQuota, setAiQuota] = useState({ used: 0, limit: 10, remaining: 10 })
  const abortRef = useRef(null)

  // Frame editing
  const [editingFrame, setEditingFrame] = useState(null)

  // Graph mode state
  const [equations, setEquations] = useState([
    { id: 1, expression: '', color: GRAPH_COLORS[0] },
  ])
  const [graphSettings, setGraphSettings] = useState({
    xMin: -10, xMax: 10, yMin: -10, yMax: 10, showGrid: true,
  })
  const [graphPreviewSVG, setGraphPreviewSVG] = useState('')
  const graphDebounceRef = useRef(null)

  // Mermaid mode state (side-by-side live preview)
  const [mermaidCode, setMermaidCode] = useState('')
  const [mermaidPreviewSVG, setMermaidPreviewSVG] = useState('')
  const [mermaidError, setMermaidError] = useState('')
  const mermaidDebounceRef = useRef(null)

  // LixScript code mode state
  const [lixCode, setLixCode] = useState('')
  const [lixPreviewSVG, setLixPreviewSVG] = useState('')
  const [lixErrors, setLixErrors] = useState([])
  const lixDebounceRef = useRef(null)

  // Research paper mode state
  const [researchPrompt, setResearchPrompt] = useState('')
  const [researchLixCode, setResearchLixCode] = useState('')
  const [researchPreviewSVG, setResearchPreviewSVG] = useState('')
  const [researchErrors, setResearchErrors] = useState([])
  const researchDebounceRef = useRef(null)

  const editInputRef = useRef(null)

  // Auto-dismiss success toast
  useEffect(() => {
    if (toast.status === 'success') {
      const t = setTimeout(() => setToast({ status: null, message: '' }), 2500)
      return () => clearTimeout(t)
    }
  }, [toast.status])

  // Frame edit detection
  useEffect(() => {
    if (aiModalOpen && window.__aiEditTargetFrame) {
      const frame = window.__aiEditTargetFrame
      window.__aiEditTargetFrame = null

      // Check if it's a graph frame
      if (frame._frameType === 'graph' && frame._graphData) {
        setMode('graph')
        setEditingFrame(frame)
        const gd = frame._graphData
        setEquations(gd.equations.map((eq, i) => ({ id: i + 1, expression: eq.expression, color: eq.color || GRAPH_COLORS[i % GRAPH_COLORS.length] })))
        setGraphSettings(gd.settings || { xMin: -10, xMax: 10, yMin: -10, yMax: 10, showGrid: true })
        return
      }

      setEditingFrame(frame)
      setMode('code')
      setPrompt('')
      setChatHistory([])
      if (window.__aiFramePreview) {
        setPreviewSVG(window.__aiFramePreview(frame))
        setPreviewDiagram({ nodes: [{ id: '_existing' }], edges: [], _fromFrame: true })
      }
    }
  }, [aiModalOpen])

  // Fetch AI quota on modal open
  useEffect(() => {
    if (!aiModalOpen || AI_DISABLED) return
    const authState = useAuthStore.getState()
    const params = new URLSearchParams()
    if (authState.isAuthenticated && authState.user?.id) {
      params.set('userId', authState.user.id)
    } else {
      const guestId = localStorage.getItem('lixsketch-guest-session') || 'anonymous'
      params.set('guestId', guestId)
    }
    fetch(`${WORKER_URL}/api/ai/quota?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.used !== undefined) {
          setAiQuota({
            used: data.used,
            limit: data.limit === 'unlimited' ? Infinity : data.limit,
            remaining: data.remaining === 'unlimited' ? Infinity : data.remaining,
          })
        }
      })
      .catch(() => {})
  }, [aiModalOpen])

  // Live graph preview (debounced)
  useEffect(() => {
    if (mode !== 'graph') return
    if (graphDebounceRef.current) clearTimeout(graphDebounceRef.current)
    graphDebounceRef.current = setTimeout(() => {
      if (window.__graphPreview) {
        const svg = window.__graphPreview(equations, graphSettings)
        setGraphPreviewSVG(svg)
      }
    }, 200)
    return () => { if (graphDebounceRef.current) clearTimeout(graphDebounceRef.current) }
  }, [equations, graphSettings, mode, resolvedTheme])

  // Live mermaid preview (debounced)
  useEffect(() => {
    if (mode !== 'mermaid') return
    if (!mermaidCode.trim()) {
      setMermaidPreviewSVG('')
      setMermaidError('')
      return
    }
    if (mermaidDebounceRef.current) clearTimeout(mermaidDebounceRef.current)
    mermaidDebounceRef.current = setTimeout(async () => {
      if (window.__mermaidPreview) {
        try {
          const svg = await window.__mermaidPreview(mermaidCode)
          if (svg) {
            setMermaidPreviewSVG(svg)
            setMermaidError('')
          } else {
            setMermaidPreviewSVG('')
            setMermaidError('Invalid syntax — check your Mermaid code')
          }
        } catch {
          setMermaidPreviewSVG('')
          setMermaidError('Parse error')
        }
      }
    }, 300)
    return () => { if (mermaidDebounceRef.current) clearTimeout(mermaidDebounceRef.current) }
  }, [mermaidCode, mode, resolvedTheme])

  // Live research paper LixScript preview (debounced)
  useEffect(() => {
    if (mode !== 'research') return
    if (!researchLixCode.trim()) {
      setResearchPreviewSVG('')
      setResearchErrors([])
      return
    }
    if (researchDebounceRef.current) clearTimeout(researchDebounceRef.current)
    researchDebounceRef.current = setTimeout(() => {
      if (window.__lixscriptParse && window.__lixscriptPreview) {
        const parsed = window.__lixscriptParse(researchLixCode)
        setResearchErrors(parsed.errors || [])
        if (parsed.errors.length === 0) {
          const svg = window.__lixscriptPreview(researchLixCode)
          setResearchPreviewSVG(svg || '')
        } else {
          setResearchPreviewSVG('')
        }
      }
    }, 300)
    return () => { if (researchDebounceRef.current) clearTimeout(researchDebounceRef.current) }
  }, [researchLixCode, mode])

  // Live LixScript preview (debounced)
  useEffect(() => {
    if (mode !== 'code') return
    if (!lixCode.trim()) {
      setLixPreviewSVG('')
      setLixErrors([])
      return
    }
    if (lixDebounceRef.current) clearTimeout(lixDebounceRef.current)
    lixDebounceRef.current = setTimeout(() => {
      if (window.__lixscriptParse && window.__lixscriptPreview) {
        const parsed = window.__lixscriptParse(lixCode)
        setLixErrors(parsed.errors || [])
        if (parsed.errors.length === 0) {
          const svg = window.__lixscriptPreview(lixCode)
          setLixPreviewSVG(svg || '')
        } else {
          setLixPreviewSVG('')
        }
      }
    }, 300)
    return () => { if (lixDebounceRef.current) clearTimeout(lixDebounceRef.current) }
  }, [lixCode, mode])

  useEffect(() => {
    if (previewDiagram && editInputRef.current) editInputRef.current.focus()
  }, [previewDiagram])

  const resetPreview = useCallback(() => {
    setPreviewDiagram(null)
    setPreviewSVG('')
    setEditPrompt('')
    setChatHistory([])
    setPrompt('')
    setEditingFrame(null)
    setMermaidCode('')
    setMermaidPreviewSVG('')
    setMermaidError('')
    setLixCode('')
    setLixPreviewSVG('')
    setLixErrors([])
    setResearchPrompt('')
    setResearchLixCode('')
    setResearchPreviewSVG('')
    setResearchErrors([])
  }, [])

  const resetGraph = useCallback(() => {
    setEquations([{ id: 1, expression: '', color: GRAPH_COLORS[0] }])
    setGraphSettings({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, showGrid: true })
    setGraphPreviewSVG('')
    setEditingFrame(null)
  }, [])

  const handleClose = useCallback(() => {
    toggleAIModal()
    setEditingFrame(null)
    window.__aiEditTargetFrame = null
  }, [toggleAIModal])

  // --- Diagram generation ---
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return
    const currentPrompt = prompt.trim()
    const isMermaid = mode === 'mermaid'

    if (isMermaid) {
      setIsGenerating(true)
      try {
        // Use unified mermaid preview (handles both flowchart + sequence)
        if (window.__mermaidPreview) {
          const svg = await window.__mermaidPreview(currentPrompt)
          if (svg) {
            // Store the raw source so we can re-render on canvas
            setPreviewDiagram({ _mermaidSrc: currentPrompt, _svgPreview: true })
            setPreviewSVG(svg)
            setChatHistory([{ role: 'user', content: currentPrompt }])
          } else {
            setToast({ status: 'error', message: 'Invalid Mermaid syntax.' })
          }
        } else if (window.__mermaidParser) {
          // Fallback: old sync path for flowcharts
          const diagram = window.__mermaidParser(currentPrompt)
          if (diagram) {
            setPreviewDiagram(diagram)
            if (window.__aiPreview) setPreviewSVG(window.__aiPreview(diagram))
            setChatHistory([{ role: 'user', content: currentPrompt }])
          } else {
            setToast({ status: 'error', message: 'Invalid Mermaid syntax.' })
          }
        }
      } catch {
        setToast({ status: 'error', message: 'Failed to parse Mermaid syntax.' })
      }
      setIsGenerating(false)
      return
    }

    // Check quota before generating
    if (aiQuota.remaining !== Infinity && aiQuota.remaining <= 0) {
      setToast({ status: 'error', message: `Daily AI limit reached (${aiQuota.used}/${aiQuota.limit}). Upgrade for more.` })
      return
    }

    setIsGenerating(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const messages = [...chatHistory, { role: 'user', content: currentPrompt }]
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentPrompt,
          mode: 'lixscript',
          history: chatHistory.length > 0 ? chatHistory : undefined,
          previousLixCode: lixCode || undefined,
        }),
        signal: controller.signal,
      })
      let data
      try { data = await res.json() } catch {
        setToast({ status: 'error', message: 'Invalid server response' })
        setIsGenerating(false)
        abortRef.current = null
        return
      }
      if (!res.ok || data.error) {
        if (data.quotaExceeded) {
          setToast({ status: 'error', message: `Daily AI limit reached (${data.used}/${data.limit}). Upgrade for more.` })
        } else {
          setToast({ status: 'error', message: data.error || `Failed (${res.status})` })
        }
        setIsGenerating(false)
        abortRef.current = null
        return
      }

      // Record usage after successful generation
      const authState = useAuthStore.getState()
      const usageBody = { mode: 'lixscript' }
      if (authState.isAuthenticated && authState.user?.id) {
        usageBody.userId = authState.user.id
      } else {
        usageBody.guestId = localStorage.getItem('lixsketch-guest-session') || 'anonymous'
      }
      fetch(`${WORKER_URL}/api/ai/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usageBody),
      })
        .then(r => r.json())
        .then(d => {
          if (d.used !== undefined) {
            setAiQuota({
              used: d.used,
              limit: d.limit === 'unlimited' ? Infinity : d.limit,
              remaining: d.remaining === 'unlimited' ? Infinity : d.remaining,
            })
          }
        })
        .catch(() => {})

      // AI returned LixScript code — switch to code tab and populate
      if (data.lixscript) {
        setMode('code')
        setLixCode(data.lixscript)
        setChatHistory([...messages, { role: 'assistant', content: data.lixscript }])
      } else if (data.diagram?.nodes?.length) {
        // Fallback: JSON diagram mode
        setPreviewDiagram(data.diagram)
        if (window.__aiPreview) setPreviewSVG(window.__aiPreview(data.diagram))
        setChatHistory([...messages, { role: 'assistant', content: JSON.stringify(data.diagram) }])
      } else {
        setToast({ status: 'error', message: 'Empty diagram. Try rephrasing.' })
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setToast({ status: null, message: '' })
      } else {
        setToast({ status: 'error', message: 'Connection failed.' })
      }
    }
    setIsGenerating(false)
    abortRef.current = null
  }, [prompt, mode, chatHistory, lixCode, aiQuota])

  // --- Research paper generation ---
  const handleResearchGenerate = useCallback(async () => {
    if (!researchPrompt.trim()) return

    if (aiQuota.remaining !== Infinity && aiQuota.remaining <= 0) {
      setToast({ status: 'error', message: `Daily AI limit reached (${aiQuota.used}/${aiQuota.limit}). Upgrade for more.` })
      return
    }

    setIsGenerating(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const messages = [...chatHistory, { role: 'user', content: researchPrompt.trim() }]
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: researchPrompt.trim(),
          mode: 'research-lixscript',
          history: chatHistory.length > 0 ? chatHistory : undefined,
          previousLixCode: researchLixCode || undefined,
        }),
        signal: controller.signal,
      })
      let data
      try { data = await res.json() } catch {
        setToast({ status: 'error', message: 'Invalid server response' })
        setIsGenerating(false)
        abortRef.current = null
        return
      }
      if (!res.ok || data.error) {
        if (data.quotaExceeded) {
          setToast({ status: 'error', message: `Daily AI limit reached (${data.used}/${data.limit}). Upgrade for more.` })
        } else {
          setToast({ status: 'error', message: data.error || `Failed (${res.status})` })
        }
        setIsGenerating(false)
        abortRef.current = null
        return
      }

      // Record usage
      const authState = useAuthStore.getState()
      const usageBody = { mode: 'research-lixscript' }
      if (authState.isAuthenticated && authState.user?.id) {
        usageBody.userId = authState.user.id
      } else {
        usageBody.guestId = localStorage.getItem('lixsketch-guest-session') || 'anonymous'
      }
      fetch(`${WORKER_URL}/api/ai/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usageBody),
      })
        .then(r => r.json())
        .then(d => {
          if (d.used !== undefined) {
            setAiQuota({
              used: d.used,
              limit: d.limit === 'unlimited' ? Infinity : d.limit,
              remaining: d.remaining === 'unlimited' ? Infinity : d.remaining,
            })
          }
        })
        .catch(() => {})

      if (data.lixscript) {
        setResearchLixCode(data.lixscript)
        setChatHistory([...messages, { role: 'assistant', content: data.lixscript }])
      } else {
        setToast({ status: 'error', message: 'Empty response. Try rephrasing.' })
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setToast({ status: null, message: '' })
      } else {
        setToast({ status: 'error', message: 'Connection failed.' })
      }
    }
    setIsGenerating(false)
    abortRef.current = null
  }, [researchPrompt, chatHistory, researchLixCode, aiQuota])

  // --- Place research paper LixScript ---
  const handlePlaceResearch = useCallback(() => {
    if (!researchLixCode.trim() || researchErrors.length > 0) return
    handleClose()
    if (window.__lixscriptExecute) {
      const result = window.__lixscriptExecute(researchLixCode)
      if (!result.success) {
        setToast({ status: 'error', message: result.errors?.[0]?.message || 'Failed to execute LixScript' })
        return
      }
    }
    setToast({ status: 'success', message: '' })
    resetPreview()
  }, [researchLixCode, researchErrors, handleClose, resetPreview])

  // --- Diagram editing ---
  const handleEdit = useCallback(async (directText) => {
    const text = directText || editPrompt.trim()
    if (!text || !previewDiagram) return
    setEditPrompt('')
    setIsGenerating(true)
    try {
      const newHistory = [...chatHistory, { role: 'user', content: text }]
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text, mode: 'text',
          history: chatHistory, previousDiagram: previewDiagram,
        }),
      })
      let data
      try { data = await res.json() } catch {
        setToast({ status: 'error', message: 'Invalid server response' })
        setIsGenerating(false)
        return
      }
      if (!res.ok || data.error) {
        setToast({ status: 'error', message: data.error || `Failed (${res.status})` })
        setIsGenerating(false)
        return
      }
      if (!data.diagram?.nodes?.length) {
        setToast({ status: 'error', message: 'Edit returned empty diagram.' })
        setIsGenerating(false)
        return
      }
      setPreviewDiagram(data.diagram)
      if (window.__aiPreview) setPreviewSVG(window.__aiPreview(data.diagram))
      setChatHistory([...newHistory, { role: 'assistant', content: JSON.stringify(data.diagram) }])
    } catch {
      setToast({ status: 'error', message: 'Connection failed.' })
    }
    setIsGenerating(false)
  }, [editPrompt, previewDiagram, chatHistory])

  // --- Place diagram ---
  const handlePlace = useCallback(async () => {
    if (!previewDiagram || previewDiagram._fromFrame) return

    if (editingFrame) {
      try {
        const contained = editingFrame.containedShapes ? [...editingFrame.containedShapes] : []
        if (typeof editingFrame.destroy === 'function') editingFrame.destroy()
        contained.forEach(s => {
          if (!s) return
          const idx = window.shapes?.indexOf(s)
          if (idx !== -1) window.shapes.splice(idx, 1)
          if (s.group?.parentNode) s.group.parentNode.removeChild(s.group)
        })
        const idx = window.shapes?.indexOf(editingFrame)
        if (idx !== -1) window.shapes.splice(idx, 1)
      } catch {}
    }

    handleClose()

    // Mermaid source-based diagram (sequence or flowchart via unified renderer)
    if (previewDiagram._mermaidSrc && window.__mermaidRenderer) {
      try {
        const success = await window.__mermaidRenderer(previewDiagram._mermaidSrc)
        if (!success) {
          setToast({ status: 'error', message: 'Failed to render diagram' })
          return
        }
      } catch {
        setToast({ status: 'error', message: 'Failed to render diagram' })
        return
      }
    } else if (window.__aiRenderer) {
      const success = window.__aiRenderer(previewDiagram)
      if (success === false) {
        setToast({ status: 'error', message: 'Failed to render diagram' })
        return
      }
    }
    setToast({ status: 'success', message: '' })
    resetPreview()
  }, [previewDiagram, handleClose, resetPreview, editingFrame])

  // --- Place mermaid ---
  const handlePlaceMermaid = useCallback(async () => {
    if (!mermaidCode.trim() || !mermaidPreviewSVG) return
    handleClose()
    if (window.__mermaidRenderer) {
      try {
        const success = await window.__mermaidRenderer(mermaidCode)
        if (!success) {
          setToast({ status: 'error', message: 'Failed to render diagram' })
          return
        }
      } catch {
        setToast({ status: 'error', message: 'Failed to render diagram' })
        return
      }
    }
    setToast({ status: 'success', message: '' })
    resetPreview()
  }, [mermaidCode, mermaidPreviewSVG, handleClose, resetPreview])

  // --- Place LixScript ---
  const handlePlaceLixScript = useCallback(() => {
    if (!lixCode.trim() || lixErrors.length > 0) return
    handleClose()
    if (window.__lixscriptExecute) {
      const result = window.__lixscriptExecute(lixCode)
      if (!result.success) {
        setToast({ status: 'error', message: result.errors?.[0]?.message || 'Failed to execute LixScript' })
        return
      }
    }
    setToast({ status: 'success', message: '' })
    resetPreview()
  }, [lixCode, lixErrors, handleClose, resetPreview])

  // --- Place graph ---
  const handlePlaceGraph = useCallback(() => {
    const validEquations = equations.filter(eq => eq.expression && eq.expression.trim())
    if (validEquations.length === 0) return

    handleClose()
    if (window.__graphRenderer) {
      // Updating an existing graph keeps its canvas geometry intact.
      const graphToUpdate = editingFrame?._frameType === 'graph' ? editingFrame : null
      const success = window.__graphRenderer(equations, graphSettings, graphToUpdate)
      if (!success) {
        setToast({ status: 'error', message: 'Failed to render graph' })
        return
      }
    }
    setToast({ status: 'success', message: '' })
    resetGraph()
  }, [equations, graphSettings, handleClose, resetGraph, editingFrame])

  // --- Graph equation helpers ---
  const addEquation = useCallback(() => {
    setEquations(prev => [
      ...prev,
      { id: Date.now(), expression: '', color: GRAPH_COLORS[prev.length % GRAPH_COLORS.length] },
    ])
  }, [])

  const removeEquation = useCallback((id) => {
    setEquations(prev => prev.length <= 1 ? prev : prev.filter(eq => eq.id !== id))
  }, [])

  const updateEquation = useCallback((id, field, value) => {
    setEquations(prev => prev.map(eq => eq.id === id ? { ...eq, [field]: value } : eq))
  }, [])

  const updateGraphSetting = useCallback((key, value) => {
    setGraphSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      if (mode === 'graph') handlePlaceGraph()
      else if (mode === 'mermaid') handlePlaceMermaid()
      else if (mode === 'code') handlePlaceLixScript()
      else if (mode === 'research') handlePlaceResearch()
      else if (previewDiagram) handlePlace()
    }
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit() }
  }

  const isFrameEdit = !!editingFrame
  const isGraphMode = mode === 'graph'
  const isCodeMode = mode === 'code'
  const isResearchMode = mode === 'research'
  const hasValidEquations = equations.some(eq => eq.expression && eq.expression.trim())

  return (
    <>
      <AIToast status={toast.status} message={toast.message} onDismiss={() => setToast({ status: null, message: '' })} />

      {aiModalOpen && (
        <div className="fixed inset-0 z-9999 flex items-center justify-center font-[lixFont]" onClick={handleClose}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <div
            className="relative bg-surface-card border border-border-light rounded-2xl p-5 sm:p-6 mx-3 overflow-hidden transition-all duration-300 w-[92vw] max-w-[1200px] h-[88vh] max-h-[88vh]"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with breadcrumb */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {/* Back button - shown in preview/edit mode or graph edit mode */}
                {(previewDiagram || (isFrameEdit && isGraphMode)) && (
                  <button
                    onClick={isGraphMode ? resetGraph : resetPreview}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200"
                    title="Back"
                  >
                    <i className="bx bx-arrow-back text-lg" />
                  </button>
                )}

                {/* Breadcrumb path */}
                <div className="flex items-center gap-1.5 text-sm">
                  {isFrameEdit ? (
                    <>
                      <span className="text-text-dim">frame</span>
                      <span className="text-text-dim">/</span>
                      <span className="text-accent-blue font-[lixCode] text-xs">{editingFrame?.shapeID || editingFrame?.frameName || 'unknown'}</span>
                    </>
                  ) : previewDiagram ? (
                    <>
                      <span className="text-text-dim">diagram</span>
                      <span className="text-text-dim">/</span>
                      <span className="text-text-muted">preview</span>
                    </>
                  ) : (
                    <h2 className="text-text-primary text-lg font-medium flex items-center gap-2.5">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-blue">
                        {isGraphMode ? (
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        ) : isResearchMode ? (
                          <>
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                            <path d="M6 8h4M6 11h3M14 8h4M14 11h4" strokeWidth="1.5" />
                          </>
                        ) : isCodeMode ? (
                          <>
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                          </>
                        ) : mode === 'mermaid' ? (
                          <>
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="8" y="14" width="8" height="7" rx="1" />
                            <line x1="6.5" y1="10" x2="12" y2="14" />
                            <line x1="17.5" y1="10" x2="12" y2="14" />
                          </>
                        ) : (
                          <>
                            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                            <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
                          </>
                        )}
                      </svg>
                      {isGraphMode ? 'Graph Editor' : isResearchMode ? 'Research Paper Illustrator' : isCodeMode ? 'LixScript Editor' : mode === 'mermaid' ? 'Mermaid Editor' : 'AI Diagram Generator'}
                    </h2>
                  )}
                </div>
              </div>

              <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200">
                <i className="bx bx-x text-2xl" />
              </button>
            </div>

            {/* Mode Tabs */}
            {!previewDiagram && !isFrameEdit && (
              <div className="flex gap-1 mb-4 bg-surface-dark rounded-xl p-1">
                {[
                  // 'Research Paper' tab was AI-inference-only and is hidden
                  // while the assistant is offline. LixScript remains visible
                  // as a preview of the upcoming MCP integration.
                  { value: 'code', label: 'LixScript', comingSoon: true },
                  { value: 'mermaid', label: 'Mermaid' },
                  { value: 'graph', label: 'Graph' },
                ].map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setMode(t.value)}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                      mode === t.value ? 'bg-accent-blue/15 text-accent-blue' : 'text-text-muted hover:text-text-primary hover:bg-accent-blue/5'
                    }`}
                  >
                    {t.label}
                    {t.comingSoon && <span className="ml-1.5 px-1.5 py-0.5 text-[9px] rounded-md bg-accent-blue/10 text-accent-blue font-medium uppercase leading-none">Coming soon</span>}
                  </button>
                ))}
              </div>
            )}

            {/* ============ RESEARCH PAPER MODE ============ */}
            {isResearchMode && !previewDiagram && !isFrameEdit ? (
              <div className="flex gap-4 h-[calc(100%-100px)]">
                {/* Left panel - AI prompt + Code editor */}
                <div className="w-[45%] min-w-[280px] flex flex-col overflow-y-auto no-scrollbar">
                  {/* AI Prompt Input */}
                  <div className="mb-3">
                    <p className="text-text-muted text-xs uppercase tracking-wider mb-2">
                      <i className="bx bx-bot mr-1" />Describe Architecture
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={researchPrompt}
                        onChange={(e) => setResearchPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleResearchGenerate()
                          }
                        }}
                        placeholder='e.g. "Full UNet architecture" or "Transformer encoder-decoder"'
                        className="flex-1 bg-surface-dark border border-border rounded-xl px-4 py-2.5 text-text-primary text-sm focus:outline-none focus:border-[#9B59B6] placeholder:text-text-dim"
                        disabled={isGenerating}
                      />
                      {isGenerating ? (
                        <button
                          onClick={() => { abortRef.current?.abort(); setIsGenerating(false) }}
                          className="px-4 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 bg-red-500/80 text-white hover:bg-red-500"
                        >
                          <i className="bx bx-stop text-base" />
                        </button>
                      ) : (
                        <button
                          onClick={handleResearchGenerate}
                          disabled={!researchPrompt.trim()}
                          className={`px-4 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 ${
                            !researchPrompt.trim() ? 'bg-surface-hover text-text-dim cursor-not-allowed' : 'bg-[#9B59B6] text-white hover:bg-[#9B59B6]/80'
                          }`}
                        >
                          <i className="bx bx-send text-base" />
                        </button>
                      )}
                    </div>
                    {aiQuota.limit !== Infinity && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="flex-1 h-1 rounded-full bg-surface-hover overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, (aiQuota.used / aiQuota.limit) * 100)}%`,
                              backgroundColor: aiQuota.remaining <= 2 ? '#EF4444' : '#9B59B6',
                            }}
                          />
                        </div>
                        <span className={`text-[10px] ${aiQuota.remaining <= 2 ? 'text-red-400' : 'text-text-dim'}`}>
                          {aiQuota.remaining}/{aiQuota.limit}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick architecture presets */}
                  <div className="mb-3 pb-3 border-b border-white/[0.06]">
                    <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Architecture Templates</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'UNet', prompt: 'Full UNet architecture with encoder path (4 downsampling blocks with Conv+BN+ReLU), bottleneck, decoder path (4 upsampling blocks), and skip connections between encoder and decoder at each level. Show channel dimensions 64→128→256→512→1024→512→256→128→64' },
                        { label: 'Transformer', prompt: 'Full Transformer architecture with encoder stack (Multi-Head Attention, Add & Norm, Feed-Forward, Add & Norm) and decoder stack (Masked MHA, Add & Norm, Cross-Attention, Add & Norm, FFN, Add & Norm). Show input embeddings, positional encoding, and output linear + softmax' },
                        { label: 'ResNet Block', prompt: 'ResNet residual block architecture showing Conv→BN→ReLU→Conv→BN with skip connection bypass, followed by addition and ReLU. Show 3 stacked residual blocks with downsampling' },
                        { label: 'GPT', prompt: 'GPT architecture with token embedding, positional embedding, N stacked transformer decoder blocks (Masked Self-Attention → Add & Norm → FFN → Add & Norm with residual connections), final Layer Norm → Linear → Softmax' },
                        { label: 'VAE', prompt: 'Variational Autoencoder with encoder network producing mu and sigma parameters, reparameterization trick sampling from latent space, decoder network reconstructing input, and KL divergence + reconstruction loss' },
                        { label: 'GAN', prompt: 'Generative Adversarial Network with Generator (noise input → upsampling blocks → generated image) and Discriminator (image input → downsampling blocks → real/fake classification), showing adversarial training loop' },
                        { label: 'Diffusion', prompt: 'Diffusion model (DDPM) showing forward process (gradual noise addition to image), reverse process (UNet denoiser predicting noise at each step), and conditioning input for guided generation' },
                        { label: 'CNN Pipeline', prompt: 'Standard CNN classification pipeline: Input Image → Conv+ReLU → MaxPool → Conv+ReLU → MaxPool → Conv+ReLU → Global Average Pool → Dense → Dropout → Softmax Output. Show feature map dimensions at each stage' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => { setResearchPrompt(preset.prompt); }}
                          className="px-2.5 py-1 rounded-lg text-[10px] text-[#9B59B6]/70 border border-[#9B59B6]/20 hover:border-[#9B59B6]/40 hover:text-[#9B59B6] transition-all"
                        >{preset.label}</button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <p className="text-text-muted text-xs uppercase tracking-wider">Generated LixScript</p>
                    <span className="text-[#9B59B6]/50 text-[9px] uppercase tracking-wider">Research Paper Mode</span>
                  </div>
                  <textarea
                    value={researchLixCode}
                    onChange={(e) => setResearchLixCode(e.target.value)}
                    placeholder={'// Use AI above to generate research paper diagrams\n// Or write LixScript manually with shading:\n\nrect conv1 at 200, 60 size 220x50 {\n  stroke: #4A90D9\n  fill: #4A90D9\n  fillStyle: solid\n  roughness: 0\n  label: "Conv2D 64"\n  labelColor: #ffffff\n  shadeColor: #4A90D9\n  shadeOpacity: 0.25\n}'}
                    className="flex-1 min-h-[200px] bg-surface-dark border border-border rounded-xl px-4 py-3 text-text-primary text-sm leading-relaxed resize-none focus:outline-none focus:border-[#9B59B6] placeholder:text-text-dim font-mono"
                    spellCheck={false}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault()
                        const start = e.target.selectionStart
                        const end = e.target.selectionEnd
                        const val = e.target.value
                        setResearchLixCode(val.substring(0, start) + '  ' + val.substring(end))
                        setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 2 }, 0)
                        return
                      }
                      handleKeyDown(e)
                    }}
                  />

                  {/* Place button - sticky at bottom */}
                  <div className="sticky bottom-0 pt-3 pb-1 mt-3 bg-surface-card border-t border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="text-text-dim text-xs">Ctrl + Enter to place</span>
                      <button
                        onClick={handlePlaceResearch}
                        disabled={!researchPreviewSVG || researchErrors.length > 0}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                          !researchPreviewSVG || researchErrors.length > 0 ? 'bg-surface-hover text-text-dim cursor-not-allowed' : 'bg-[#9B59B6] text-white hover:bg-[#9B59B6]/80'
                        }`}
                      >
                        <i className="bx bx-check text-base" />
                        Place on Canvas
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right panel - Live preview */}
                <div className="flex-1 flex flex-col min-w-0">
                  <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Preview</p>
                  {isGenerating ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl bg-[#111] border border-white/[0.06]">
                      <DiagramLoadingAnimation color="#9B59B6" />
                    </div>
                  ) : researchErrors.length > 0 ? (
                    <div className="flex-1 flex flex-col rounded-xl bg-[#111] border border-white/[0.06] p-4 overflow-y-auto">
                      <div className="flex items-center gap-2 mb-3">
                        <i className="bx bx-error-circle text-red-400 text-lg" />
                        <span className="text-red-400 text-sm font-medium">{researchErrors.length} error{researchErrors.length > 1 ? 's' : ''}</span>
                      </div>
                      {researchErrors.map((err, i) => (
                        <p key={i} className="text-red-400/80 text-[11px] font-mono mb-1">
                          <span className="text-red-400/50">line {err.line}:</span> {err.message}
                        </p>
                      ))}
                    </div>
                  ) : researchPreviewSVG ? (
                    <DiagramPreview svgMarkup={researchPreviewSVG} className="flex-1 min-h-[300px]" />
                  ) : (
                    <div className="flex-1 flex items-center justify-center rounded-xl bg-[#111] border border-white/[0.06]">
                      <div className="text-center px-6">
                        <div className="mb-4">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9B59B6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto opacity-30">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                          </svg>
                        </div>
                        <p className="text-text-dim text-sm mb-1">Research Paper Illustrations</p>
                        <p className="text-text-dim/50 text-[10px]">Generate publication-ready architecture diagrams</p>
                        <p className="text-text-dim/40 text-[10px] mt-1">UNet, Transformer, ResNet, GPT, VAE, GAN, and custom architectures</p>
                      </div>
                    </div>
                  )}
                  <p className="text-text-dim text-[10px] mt-1">Scroll to zoom, drag to pan</p>
                </div>
              </div>

            ) : /* ============ MERMAID MODE (side-by-side) ============ */
            mode === 'mermaid' && !previewDiagram && !isFrameEdit ? (
              <div className="flex gap-4 h-[calc(100%-100px)]">
                {/* Left panel - Code editor */}
                <div className="w-[45%] min-w-[280px] flex flex-col">
                  <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Mermaid Code</p>
                  <textarea
                    value={mermaidCode}
                    onChange={(e) => setMermaidCode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={'flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Action]\n  B -->|No| D[End]\n\nerDiagram\n  USER ||--o{ ORDER : places'}
                    className="flex-1 bg-surface-dark border border-border rounded-xl px-4 py-3 text-text-primary text-sm leading-relaxed resize-none focus:outline-none focus:border-accent-blue placeholder:text-text-dim font-mono"
                    autoFocus
                    spellCheck={false}
                  />

                  {/* Quick examples */}
                  <div className="mt-3 pt-3 border-t border-white/6">
                    <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Quick Examples</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Flowchart', code: 'graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Process]\n  B -->|No| D[End]\n  C --> D' },
                        { label: 'LR Flow', code: 'graph LR\n  A[Input] --> B(Process)\n  B --> C((Output))\n  B --> D{Check}\n  D --> A' },
                        { label: 'Sequence', code: 'sequenceDiagram\n  Alice ->> Bob: Hello Bob\n  Bob -->> Alice: Hi Alice\n  Alice ->> Bob: How are you?\n  Bob -->> Alice: Great!' },
                        { label: 'ER Diagram', code: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string name\n    string email\n  }\n  ORDER {\n    int id PK\n    float total\n  }' },
                        { label: 'Bar Chart', code: 'xychart-beta\n  title "Weekly Focus"\n  x-axis [Mon, Tue, Wed, Thu, Fri]\n  bar [4, 7, 5, 8, 6]' },
                        { label: 'Pie Chart', code: 'pie title Project Time\n  "Design" : 35\n  "Build" : 45\n  "Review" : 20' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => setMermaidCode(preset.code)}
                          className="px-2 py-1 rounded-lg text-[10px] text-text-dim border border-border hover:border-accent-blue/40 hover:text-accent-blue transition-all"
                        >{preset.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Place button */}
                  <div className="mt-auto  pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-text-dim text-xs">Ctrl + Enter to place</span>
                      <button
                        onClick={handlePlaceMermaid}
                        disabled={!mermaidPreviewSVG}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                          !mermaidPreviewSVG ? 'bg-surface-hover text-text-dim cursor-not-allowed' : 'bg-accent-blue text-white hover:bg-accent-blue/80'
                        }`}
                      >
                        <i className="bx bx-check text-base" />
                        Place on Canvas
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right panel - Live preview */}
                <div className="flex-1 flex flex-col min-w-0">
                  <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Preview</p>
                  {mermaidError ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl bg-surface-card border border-border">
                      <p className="text-red-400/70 text-sm">{mermaidError}</p>
                    </div>
                  ) : mermaidPreviewSVG ? (
                    <DiagramPreview svgMarkup={mermaidPreviewSVG} className="flex-1 min-h-[300px]" />
                  ) : (
                    <div className="flex-1 flex items-center justify-center rounded-xl bg-surface-card border border-border">
                      <p className="text-text-dim text-sm">Type Mermaid code to see a live preview</p>
                    </div>
                  )}
                  <p className="text-text-dim text-[10px] mt-1">Scroll to zoom, drag to pan</p>
                </div>
              </div>

            ) : /* ============ LIXSCRIPT / MCP COMING SOON ============ */
            isCodeMode && !previewDiagram && !isFrameEdit ? (
              <div className="h-[calc(100%-100px)] flex items-center justify-center">
                <div className="w-full max-w-xl rounded-2xl border border-border bg-surface-card px-8 py-10 text-center">
                  <div className="mx-auto mb-5 w-12 h-12 rounded-xl bg-[#7667a8]/12 border border-[#7667a8]/25 flex items-center justify-center">
                    <i className="bx bx-plug text-2xl text-[#7667a8]" />
                  </div>
                  <span className="inline-flex px-2.5 py-1 rounded-full bg-accent-blue/10 text-accent-blue text-[10px] font-semibold uppercase tracking-wider">Coming soon</span>
                  <h3 className="mt-4 text-xl text-text-primary">LixScript MCP</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    LixScript is being prepared as the programmable MCP interface for LixSketch. The editor will return when scripts can run through the supported platform workflow.
                  </p>
                </div>
              </div>

            ) : /* ============ LEGACY CODE MODE (kept until MCP ships) ============ */
            isCodeMode && !previewDiagram && !isFrameEdit ? (
              <div className="flex gap-4 h-[calc(100%-100px)]">
                {/* Left panel - AI prompt + Code editor */}
                <div className="w-[45%] min-w-[280px] flex flex-col overflow-y-auto no-scrollbar">
                  {!AI_DISABLED && (
                  <div className="mb-3">
                    <p className="text-text-muted text-xs uppercase tracking-wider mb-2">
                      <i className="bx bx-bot mr-1" />Describe with AI
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleGenerate()
                          }
                        }}
                        placeholder='e.g. "User auth flow with login, 2FA, dashboard"'
                        className="flex-1 bg-surface-dark border border-border rounded-xl px-4 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent-blue placeholder:text-text-dim"
                        disabled={isGenerating}
                      />
                      {isGenerating ? (
                        <button
                          onClick={() => { abortRef.current?.abort(); setIsGenerating(false) }}
                          className="px-4 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 bg-red-500/80 text-white hover:bg-red-500"
                        >
                          <i className="bx bx-stop text-base" />
                        </button>
                      ) : (
                        <button
                          onClick={handleGenerate}
                          disabled={!prompt.trim()}
                          className={`px-4 py-2.5 rounded-xl text-sm transition-all duration-200 flex items-center gap-2 ${
                            !prompt.trim() ? 'bg-surface-hover text-text-dim cursor-not-allowed' : 'bg-accent-blue text-white hover:bg-accent-blue/80'
                          }`}
                        >
                          <i className="bx bx-send text-base" />
                        </button>
                      )}
                    </div>
                    {aiQuota.limit !== Infinity && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="flex-1 h-1 rounded-full bg-surface-hover overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, (aiQuota.used / aiQuota.limit) * 100)}%`,
                              backgroundColor: aiQuota.remaining <= 2 ? '#EF4444' : '#4A90D9',
                            }}
                          />
                        </div>
                        <span className={`text-[10px] ${aiQuota.remaining <= 2 ? 'text-red-400' : 'text-text-dim'}`}>
                          {aiQuota.remaining}/{aiQuota.limit}
                        </span>
                      </div>
                    )}
                  </div>
                  )}

                  <div className="flex items-center justify-between mb-2">
                    <p className="text-text-muted text-xs uppercase tracking-wider">LixScript Code</p>
                    <a href="/docs" target="_blank" rel="noopener noreferrer" className="text-accent-blue/70 hover:text-accent-blue text-[10px] flex items-center gap-1 transition-colors">
                      <i className="bx bx-book-open text-xs" />Learn LixScript syntax
                    </a>
                  </div>
                  <textarea
                    value={lixCode}
                    onChange={(e) => setLixCode(e.target.value)}
                    placeholder={'// Write LixScript or use AI above\n\nrect start at 200, 60 size 200x65 {\n  stroke: #4A90D9\n  label: "Start"\n}\n\nrect process at start.x, start.bottom + 150 size 200x65 {\n  stroke: #2ECC71\n  label: "Process"\n}\n\narrow a1 from start.bottom to process.top {\n  stroke: #e0e0e0\n}'}
                    className="flex-1 min-h-[280px] bg-surface-dark border border-border rounded-xl px-4 py-3 text-text-primary text-sm leading-relaxed resize-none focus:outline-none focus:border-accent-blue placeholder:text-text-dim font-mono"
                    autoFocus
                    spellCheck={false}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault()
                        const start = e.target.selectionStart
                        const end = e.target.selectionEnd
                        const val = e.target.value
                        setLixCode(val.substring(0, start) + '  ' + val.substring(end))
                        setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 2 }, 0)
                        return
                      }
                      handleKeyDown(e)
                    }}
                  />

                  {/* Quick examples */}
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Quick Examples</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Flowchart', code: '// Simple flowchart\n$blue = #4A90D9\n$green = #2ECC71\n$gray = #e0e0e0\n\nrect start at 200, 60 size 200x65 {\n  stroke: $blue\n  label: "Start"\n}\n\nrect process at start.x, start.bottom + 150 size 200x65 {\n  stroke: $green\n  label: "Process"\n}\n\ncircle decision at process.x, process.bottom + 150 size 110x110 {\n  stroke: #E74C3C\n  label: "OK?"\n}\n\nrect end at decision.x, decision.bottom + 150 size 200x65 {\n  stroke: #9B59B6\n  label: "End"\n}\n\narrow a1 from start.bottom to process.top {\n  stroke: $gray\n}\n\narrow a2 from process.bottom to decision.top {\n  stroke: $gray\n}\n\narrow a3 from decision.bottom to end.top {\n  stroke: $gray\n  label: "Yes"\n}' },
                        { label: 'Architecture', code: '// System architecture\n$gray = #e0e0e0\n\nrect client at 50, 100 size 200x65 {\n  stroke: #4A90D9\n  fill: #4A90D9\n  fillStyle: solid\n  label: "Client"\n  labelColor: #fff\n}\n\nrect api at client.right + 250, client.y size 200x65 {\n  stroke: #2ECC71\n  label: "API Server"\n}\n\nrect db at api.right + 250, api.y size 200x65 {\n  stroke: #E74C3C\n  label: "Database"\n}\n\narrow a1 from client.right to api.left {\n  stroke: $gray\n  label: "REST"\n}\n\narrow a2 from api.right to db.left {\n  stroke: $gray\n  label: "Query"\n}' },
                        { label: 'Shapes', code: '// Shape showcase\n\nrect r1 at 50, 50 size 200x65 {\n  stroke: #4A90D9\n  label: "Rectangle"\n}\n\ncircle c1 at r1.right + 250, r1.y size 110x110 {\n  stroke: #E74C3C\n  label: "Circle"\n}\n\ntext t1 at c1.right + 250, c1.y {\n  content: "Hello LixScript!"\n  color: #F39C12\n  fontSize: 20\n}\n\nline l1 from 50, 250 to 650, 250 {\n  stroke: #555\n  style: dashed\n}' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => setLixCode(preset.code)}
                          className="px-2 py-1 rounded-lg text-[10px] text-text-dim border border-white/[0.06] hover:border-white/[0.15] hover:text-text-secondary transition-all"
                        >{preset.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Place button - sticky at bottom */}
                  <div className="sticky bottom-0 pt-3 pb-1 mt-3 bg-surface-card border-t border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="text-text-dim text-xs">Ctrl + Enter to place</span>
                      <button
                        onClick={handlePlaceLixScript}
                        disabled={!lixPreviewSVG || lixErrors.length > 0}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                          !lixPreviewSVG || lixErrors.length > 0 ? 'bg-surface-hover text-text-dim cursor-not-allowed' : 'bg-accent-blue text-white hover:bg-accent-blue/80'
                        }`}
                      >
                        <i className="bx bx-check text-base" />
                        Place on Canvas
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right panel - Live preview */}
                <div className="flex-1 flex flex-col min-w-0">
                  <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Preview</p>
                  {isGenerating ? (
                    <div className="flex-1 flex items-center justify-center rounded-xl bg-[#111] border border-white/[0.06]">
                      <DiagramLoadingAnimation color="#4A90D9" />
                    </div>
                  ) : lixErrors.length > 0 ? (
                    <div className="flex-1 flex flex-col rounded-xl bg-[#111] border border-white/[0.06] p-4 overflow-y-auto">
                      <div className="flex items-center gap-2 mb-3">
                        <i className="bx bx-error-circle text-red-400 text-lg" />
                        <span className="text-red-400 text-sm font-medium">{lixErrors.length} error{lixErrors.length > 1 ? 's' : ''}</span>
                      </div>
                      {lixErrors.map((err, i) => (
                        <p key={i} className="text-red-400/80 text-[11px] font-mono mb-1">
                          <span className="text-red-400/50">line {err.line}:</span> {err.message}
                        </p>
                      ))}
                    </div>
                  ) : lixPreviewSVG ? (
                    <DiagramPreview svgMarkup={lixPreviewSVG} className="flex-1 min-h-[300px]" />
                  ) : (
                    <div className="flex-1 flex items-center justify-center rounded-xl bg-[#111] border border-white/[0.06]">
                      <div className="text-center px-6">
                        <p className="text-text-dim text-sm mb-2">Write LixScript code to see a live preview</p>
                        <p className="text-text-dim/50 text-[10px]">Full docs at /docs/lixscript.md</p>
                      </div>
                    </div>
                  )}
                  <p className="text-text-dim text-[10px] mt-1">Scroll to zoom, drag to pan</p>
                </div>
              </div>

            ) : /* ============ GRAPH MODE ============ */
            isGraphMode ? (
              <div className="flex gap-5 h-[calc(100%-100px)]">
                {/* Left panel - Equations */}
                <div className="w-[340px] min-w-[300px] flex flex-col gap-3 overflow-y-auto no-scrollbar pr-2">
                  <p className="text-text-muted text-xs uppercase tracking-wider">Equations</p>

                  {equations.map((eq, idx) => (
                    <div key={eq.id} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={eq.color}
                        onChange={(e) => updateEquation(eq.id, 'color', e.target.value)}
                        className="w-7 h-7 rounded-lg border border-white/10 cursor-pointer bg-transparent shrink-0"
                        style={{ padding: 0 }}
                      />
                      <input
                        type="text"
                        value={eq.expression}
                        onChange={(e) => updateEquation(eq.id, 'expression', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={idx === 0 ? 'y = x^2' : idx === 1 ? 'y = sin(x)' : `equation ${idx + 1}`}
                        className="flex-1 bg-surface-dark border border-border rounded-lg px-3 py-2 text-text-primary text-sm font-[lixCode] focus:outline-none focus:border-accent-blue placeholder:text-text-dim"
                      />
                      {equations.length > 1 && (
                        <button
                          onClick={() => removeEquation(eq.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                        >
                          <i className="bx bx-x text-lg" />
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    onClick={addEquation}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-text-dim text-xs hover:text-text-secondary hover:bg-white/[0.04] transition-all border border-dashed border-white/[0.08] hover:border-white/[0.15]"
                  >
                    <i className="bx bx-plus text-sm" />
                    Add equation
                  </button>

                  {/* Range */}
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Range</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'xMin', label: 'X min' },
                        { key: 'xMax', label: 'X max' },
                        { key: 'yMin', label: 'Y min' },
                        { key: 'yMax', label: 'Y max' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <span className="text-text-dim text-[10px] w-7">{label}</span>
                          <input
                            type="number"
                            value={graphSettings[key]}
                            onChange={(e) => updateGraphSetting(key, parseFloat(e.target.value) || 0)}
                            className="w-full bg-surface-dark border border-border rounded-lg px-2 py-1.5 text-text-primary text-xs font-[lixCode] focus:outline-none focus:border-accent-blue"
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => updateGraphSetting('showGrid', !graphSettings.showGrid)}
                      className="flex items-center gap-2 mt-2.5 px-2 py-1.5 rounded-lg text-text-dim text-xs hover:text-text-secondary transition-all"
                    >
                      <div className={`w-7 h-4 rounded-full border transition-all duration-150 relative ${graphSettings.showGrid ? 'bg-accent-blue border-accent-blue' : 'bg-surface-active border-border-light'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-150 ${graphSettings.showGrid ? 'left-3.5 bg-white' : 'left-0.5 bg-text-secondary'}`} />
                      </div>
                      Show Grid
                    </button>
                  </div>

                  {/* Quick presets */}
                  <div className="mt-2 pt-2 border-t border-white/[0.06]">
                    <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Quick Examples</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Parabola', eq: 'x^2' },
                        { label: 'Sine', eq: 'sin(x)' },
                        { label: 'Cosine', eq: 'cos(x)' },
                        { label: 'Cubic', eq: 'x^3' },
                        { label: 'Sqrt', eq: 'sqrt(x)' },
                        { label: 'Exp', eq: 'exp(x)' },
                        { label: 'Log', eq: 'ln(x)' },
                        { label: '|x|', eq: 'abs(x)' },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => {
                            const emptyIdx = equations.findIndex(eq => !eq.expression.trim())
                            if (emptyIdx !== -1) {
                              updateEquation(equations[emptyIdx].id, 'expression', preset.eq)
                            } else {
                              setEquations(prev => [...prev, {
                                id: Date.now(), expression: preset.eq,
                                color: GRAPH_COLORS[prev.length % GRAPH_COLORS.length],
                              }])
                            }
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] text-text-dim border border-white/[0.06] hover:border-white/[0.15] hover:text-text-secondary transition-all"
                        >{preset.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Place button */}
                  <div className="mt-auto pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-text-dim text-xs">Ctrl + Enter to place</span>
                      <button
                        onClick={handlePlaceGraph}
                        disabled={!hasValidEquations}
                        className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                          !hasValidEquations ? 'bg-surface-hover text-text-dim cursor-not-allowed' : 'bg-accent-blue text-white hover:bg-accent-blue/80'
                        }`}
                      >
                        <i className="bx bx-check text-base" />
                        {editingFrame ? 'Update Graph' : 'Place on Canvas'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right panel - Live preview */}
                <div className="flex-1 flex flex-col min-w-0">
                  <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Preview</p>
                  <DiagramPreview svgMarkup={graphPreviewSVG} className="flex-1 min-h-[300px]" />
                  <p className="text-text-dim text-[10px] mt-1">Scroll to zoom, drag to pan</p>
                </div>
              </div>

            ) : previewDiagram ? (
              /* ============ PREVIEW MODE ============ */
              <div className="flex flex-col h-[calc(100%-100px)]">
                <div className="flex-1 flex flex-col min-h-0 mb-4">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <p className="text-text-muted text-xs uppercase tracking-wider">
                      {previewDiagram?._fromFrame ? 'Current Frame' : 'Preview'}
                    </p>
                    {!previewDiagram?._fromFrame && !previewDiagram?._mermaidSrc && (
                      <p className="text-text-dim text-xs">
                        {previewDiagram.nodes?.length || 0} nodes, {previewDiagram.edges?.length || 0} edges
                        {previewDiagram.subgraphs?.length ? `, ${previewDiagram.subgraphs.length} groups` : ''}
                      </p>
                    )}
                    {previewDiagram?._mermaidSrc && (
                      <p className="text-text-dim text-xs">Mermaid Diagram</p>
                    )}
                  </div>
                  <DiagramPreview svgMarkup={previewSVG} className="flex-1 min-h-[200px]" />
                  <p className="text-text-dim text-[10px] mt-1 shrink-0">Scroll to zoom, drag to pan</p>
                </div>

                {/* AI Edit controls — only for AI-generated diagrams, not raw mermaid */}
                {!AI_DISABLED && !previewDiagram?._mermaidSrc && (
                  <>
                    <div className="mb-4 shrink-0">
                      <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Suggest Edits</p>
                      <div className="flex gap-2">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          placeholder='e.g. "Add an error handling step" or "Make it left-to-right"'
                          className="flex-1 bg-surface-dark border border-border rounded-xl px-4 py-2.5 text-text-primary text-sm focus:outline-none focus:border-accent-blue placeholder:text-text-dim"
                          disabled={isGenerating}
                        />
                        <button
                          onClick={() => handleEdit()}
                          disabled={!editPrompt.trim() || isGenerating}
                          className={`px-4 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                            !editPrompt.trim() || isGenerating ? 'bg-surface-hover text-text-dim cursor-not-allowed' : 'bg-surface-active text-text-primary hover:bg-white/[0.12]'
                          }`}
                        >
                          {isGenerating ? (
                            <div className="relative w-4 h-4"><div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" /></div>
                          ) : <i className="bx bx-refresh text-base" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-5 shrink-0">
                      {['Add more detail', 'Simplify it', 'Use left-to-right layout', 'Add error handling', 'Add icons', 'Group into subgraphs'].map((s) => (
                        <button
                          key={s} onClick={() => handleEdit(s)} disabled={isGenerating}
                          className="px-3 py-1 rounded-lg text-[11px] text-text-dim border border-white/[0.06] hover:border-white/[0.15] hover:text-text-secondary transition-all duration-150"
                        >{s}</button>
                      ))}
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between shrink-0">
                  <span className="text-text-dim text-xs">
                    {previewDiagram?._fromFrame ? 'Send an edit to generate a new diagram' : 'Ctrl + Enter to place'}
                  </span>
                  <div className="flex gap-2">
                    {!previewDiagram?._fromFrame && (
                      <button
                        onClick={handlePlace}
                        className="px-6 py-2.5 rounded-xl text-sm font-medium bg-accent-blue text-white hover:bg-accent-blue/80 transition-all duration-200 flex items-center gap-2"
                      >
                        <i className="bx bx-check text-base" />
                        {isFrameEdit ? 'Replace Frame' : 'Place on Canvas'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
