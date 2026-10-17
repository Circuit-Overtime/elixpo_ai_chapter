"use client"

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import useSketchStore from '../../store/useSketchStore'

/**
 * A toolbar button that opens a popover panel above it on click.
 * Shows an icon (or custom preview) in the bar, popover shows full options.
 */
export function ToolbarButton({ icon, preview, children, tooltip, label = tooltip }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const panelRef = useRef(null)
  const [panelPosition, setPanelPosition] = useState(null)

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      setPanelPosition({ left: rect.left + rect.width / 2, top: rect.top - 12 })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!ref.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={tooltip}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`h-9 flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 transition-all duration-100 ${
          open
            ? 'border-border-accent bg-accent-blue/20 text-accent-blue'
            : 'border-transparent text-text-muted hover:border-border-light hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        {preview || (icon && <i className={`bx ${icon} text-base`} />)}
        {label && <span className="whitespace-nowrap text-[11px] font-medium">{label}</span>}
        <svg className={`w-2 h-2 opacity-40 transition-transform duration-100 ${open ? 'rotate-180' : ''}`} viewBox="0 0 8 5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 1l3 3 3-3" />
        </svg>
      </button>

      {open && panelPosition && createPortal(
        <div
          ref={panelRef}
          className="fixed -translate-x-1/2 -translate-y-full z-[10050] max-w-[calc(100vw-16px)]"
          style={panelPosition}
        >
          <div className="bg-surface-card border border-border-light rounded-xl p-3 shadow-xl shadow-black/10 min-w-max">
            {children}
          </div>
          {/* Arrow pointer */}
          <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-surface-card border-r border-b border-border-light" />
        </div>,
        document.body,
      )}
    </div>
  )
}

/**
 * Simple toolbar divider
 */
function Divider() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-border-light" aria-hidden="true" />
}

/**
 * Bottom toolbar container - appears when tool/shape is active
 */
export default function ShapeSidebar({ visible, children }) {
  const viewMode = useSketchStore((s) => s.viewMode)
  const show = visible && !viewMode

  return (
    <div
      className={`absolute bottom-14 left-1/2 z-[999] max-w-[calc(100vw-24px)] -translate-x-1/2 overflow-x-auto rounded-xl border border-border-light bg-surface px-1.5 py-1.5 font-[lixFont] transition-all duration-200 ${
        show
          ? 'opacity-100 pointer-events-auto translate-y-0'
          : 'opacity-0 pointer-events-none translate-y-2'
      }`}
    >
      <div className="flex min-w-max items-center gap-1">
        {children}
      </div>
    </div>
  )
}

/**
 * Layer ordering controls - add to any shape sidebar
 */
import { useTranslation } from '../../hooks/useTranslation'

function LayerControls() {
  const { t } = useTranslation()
  const doLayer = (method) => {
    const shape = window.currentShape
    if (!shape || !window.__layerOrder) return
    window.__layerOrder[method](shape)
  }

  const actions = [
    ['sendToBack', 'bx-chevrons-down', t('sidebar.sendToBack', { defaultValue: 'Send to back' })],
    ['sendBackward', 'bx-chevron-down', t('sidebar.sendBackward')],
    ['bringForward', 'bx-chevron-up', t('sidebar.bringForward')],
    ['bringToFront', 'bx-chevrons-up', t('sidebar.bringToFront', { defaultValue: 'Bring to front' })],
  ]

  return (
    <ToolbarButton icon="bx-layer" tooltip="Arrange" label="Arrange">
      <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Layer order</p>
      <div className="grid grid-cols-2 gap-1">
        {actions.map(([method, icon, label]) => (
          <button key={method} type="button" onClick={() => doLayer(method)} className="flex min-w-32 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-text-secondary transition hover:bg-surface-hover hover:text-text-primary">
            <i className={`bx ${icon} text-base`} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </ToolbarButton>
  )
}

export { Divider, LayerControls }
