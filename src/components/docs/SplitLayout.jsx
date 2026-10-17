'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import useSketchStore from '@/store/useSketchStore'

const STORAGE_KEY = 'lixsketch-split-ratio'
const MIN_RATIO = 0.35
const MAX_RATIO = 0.65

/**
 * SplitLayout always renders the same JSX tree (canvas wrapper + handle +
 * docs wrapper) and just changes pane widths between modes. This is
 * critical because remounting SVGCanvas would re-init the imperative
 * sketch engine, wipe the zoom/pan state, and detach all shape DOM nodes.
 *
 * Modes:
 *   - canvas: canvas pane = 100%, docs pane = 0
 *   - split:  canvas pane = ratio,  docs pane = 1 - ratio
 *   - docs:   canvas pane = 0,      docs pane = 100%
 */
export default function SplitLayout({ canvas, docs }) {
  const layoutMode = useSketchStore((s) => s.layoutMode)
  const [ratio, setRatio] = useState(0.5)
  const containerRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem(STORAGE_KEY))
      if (saved >= MIN_RATIO && saved <= MAX_RATIO) setRatio(saved)
    } catch {}
  }, [])

  const onMouseDown = useCallback((e) => {
    if (layoutMode !== 'split') return
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [layoutMode])

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let r = (e.clientX - rect.left) / rect.width
      if (r < MIN_RATIO) r = MIN_RATIO
      if (r > MAX_RATIO) r = MAX_RATIO
      setRatio(r)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try { localStorage.setItem(STORAGE_KEY, String(ratio)) } catch {}
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [ratio])

  // Compute pane widths per mode (single JSX tree below).
  let leftWidth, rightWidth, handleVisible, paddingTop
  if (layoutMode === 'canvas') {
    leftWidth = '100%'
    rightWidth = '0%'
    handleVisible = false
    // canvas-only mode: header floats, canvas takes full screen as before
    paddingTop = '0px'
  } else if (layoutMode === 'docs') {
    leftWidth = '0%'
    rightWidth = '100%'
    handleVisible = false
    paddingTop = '3rem'
  } else {
    // split
    leftWidth = `${ratio * 100}%`
    rightWidth = `${(1 - ratio) * 100}%`
    handleVisible = true
    paddingTop = '3rem'
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex"
      style={{ paddingTop }}
    >
      <div
        style={{ width: leftWidth }}
        className="relative h-full overflow-hidden"
      >
        {canvas}
      </div>
      <div
        onMouseDown={onMouseDown}
        className="h-full bg-border-light hover:bg-accent-blue/40 cursor-col-resize shrink-0 transition-colors"
        style={{ width: handleVisible ? '6px' : '0px', pointerEvents: handleVisible ? 'auto' : 'none' }}
        title="Drag to resize"
      />
      <div
        style={{ width: rightWidth }}
        className={`relative h-full overflow-hidden ${handleVisible ? 'border-l border-border-light' : ''}`}
      >
        {docs}
      </div>
    </div>
  )
}
