"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import useUIStore from '../../store/useUIStore'

const SAMPLE = `# One equation per line. Comments start with #.
# Hit Cmd/Ctrl+Enter to render onto the canvas.

y = x^2
y = sin(x) * 3
y = -x + 2
`

const DEFAULT_SETTINGS = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, showGrid: true }

function parseEquations(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'))
}

/**
 * Graph modal — plots client-side via the engine's GraphRenderer. No
 * inference; the math is parsed by GraphMathParser.parseExpression.
 * Inserts the rendered graph onto the canvas through the bridge
 * SketchEngine.init() exposes as `window.__graphRenderer`.
 */
export default function GraphModal() {
  const open = useUIStore((s) => s.graphModalOpen)
  const toggle = useUIStore((s) => s.toggleGraphModal)
  const [source, setSource] = useState(SAMPLE)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const taRef = useRef(null)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => taRef.current?.focus())
    const onKey = (e) => {
      if (e.key === 'Escape') toggle()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, toggle])

  const render = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      const equations = parseEquations(source)
      if (equations.length === 0) {
        setStatus({ tone: 'error', message: 'Add at least one equation.' })
        return
      }
      // Validate via the engine's parser before handing to the renderer.
      const { parseExpression } = await import('../../../core/GraphMathParser.js')
      const bad = equations.find((eq) => !parseExpression(eq))
      if (bad) {
        setStatus({ tone: 'error', message: `Could not parse: ${bad}` })
        return
      }
      if (typeof window.__graphRenderer === 'function') {
        window.__graphRenderer(equations, settings)
        setStatus({ tone: 'success', message: `Plotted ${equations.length} equation(s).` })
        setTimeout(() => { toggle() }, 700)
      } else {
        setStatus({ tone: 'error', message: 'Graph engine not ready yet — wait a moment and retry.' })
      }
    } catch (err) {
      console.warn('[GraphModal] render failed:', err)
      setStatus({ tone: 'error', message: err?.message || 'Render failed.' })
    } finally {
      setBusy(false)
    }
  }, [source, settings, busy, toggle])

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      render()
    }
  }, [render])

  const setRange = (key) => (e) => {
    const v = parseFloat(e.target.value)
    if (Number.isFinite(v)) setSettings((s) => ({ ...s, [key]: v }))
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm font-[lixFont]"
      onClick={toggle}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[560px] max-w-[94vw] bg-surface border border-border-light rounded-2xl p-5 shadow-2xl flex flex-col gap-3"
      >
        <button
          onClick={toggle}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Close (Esc)"
        >
          <i className="bx bx-x text-lg" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/30 flex items-center justify-center">
            <i className="bx bx-line-chart text-accent-blue" />
          </div>
          <div className="flex-1">
            <h2 className="text-text-primary text-sm font-medium">Graph</h2>
            <p className="text-text-dim text-[11px]">One equation per line — plotted on the canvas. No AI involved.</p>
          </div>
        </div>

        <textarea
          ref={taRef}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="w-full h-[200px] resize-none bg-surface-card border border-border-light rounded-lg px-3 py-2 text-[12px] text-text-primary font-[lixCode] outline-none focus:border-accent-blue/50"
        />

        <div className="grid grid-cols-4 gap-2 text-[11px]">
          <label className="flex flex-col gap-0.5">
            <span className="text-text-dim">xMin</span>
            <input type="number" value={settings.xMin} onChange={setRange('xMin')}
              className="bg-surface-card border border-border-light rounded px-2 py-1 text-text-primary outline-none focus:border-accent-blue/50" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-text-dim">xMax</span>
            <input type="number" value={settings.xMax} onChange={setRange('xMax')}
              className="bg-surface-card border border-border-light rounded px-2 py-1 text-text-primary outline-none focus:border-accent-blue/50" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-text-dim">yMin</span>
            <input type="number" value={settings.yMin} onChange={setRange('yMin')}
              className="bg-surface-card border border-border-light rounded px-2 py-1 text-text-primary outline-none focus:border-accent-blue/50" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-text-dim">yMax</span>
            <input type="number" value={settings.yMax} onChange={setRange('yMax')}
              className="bg-surface-card border border-border-light rounded px-2 py-1 text-text-primary outline-none focus:border-accent-blue/50" />
          </label>
        </div>

        <div className="flex items-center justify-between">
          {status ? (
            <span className={`text-[11px] ${status.tone === 'error' ? 'text-red-400' : 'text-green-400'}`}>
              {status.message}
            </span>
          ) : (
            <span className="text-text-dim text-[11px]">Cmd/Ctrl+Enter to render · Esc to close</span>
          )}
          <button
            onClick={render}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-accent-blue text-text-primary text-[12px] font-medium hover:bg-accent-blue-hover transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {busy ? 'Plotting…' : 'Plot'}
          </button>
        </div>
      </div>
    </div>
  )
}
