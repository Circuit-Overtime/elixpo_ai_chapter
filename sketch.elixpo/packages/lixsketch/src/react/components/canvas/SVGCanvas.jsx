"use client"

import { useRef, useState, useEffect } from 'react'
import useSketchStore, { TOOLS } from '../../store/useSketchStore'
import useSketchEngine from '../../hooks/useSketchEngine'
import CanvasRulers from './CanvasRulers'

const GRID_SIZE = 20

export default function SVGCanvas() {
  const [svgReady, setSvgReady] = useState(false)
  const svgRef = useRef(null)
  const canvasBackground = useSketchStore((s) => s.canvasBackground)
  const gridEnabled = useSketchStore((s) => s.gridEnabled)
  const hydrateGrid = useSketchStore((s) => s.hydrateGrid)
  const rulersEnabled = useSketchStore((s) => s.rulersEnabled)
  const rulerUnit = useSketchStore((s) => s.rulerUnit)
  const hydrateRulers = useSketchStore((s) => s.hydrateRulers)
  const getCursor = useSketchStore((s) => s.getCursor)
  const cursor = getCursor()

  // viewBox is owned imperatively by the lixsketch engine (zoom/pan call
  // svg.setAttribute('viewBox', …) directly). React must NOT re-render
  // the viewBox prop or it'll snap back over engine writes — which is
  // what was causing zoom deformity and the pan-release jump in split
  // mode. The initial value is set in the effect below; React never
  // rewrites it after that.
  useEffect(() => {
    const applyImperative = (w, h) => {
      const zoom = window.currentZoom || 1
      const cv = window.currentViewBox || { x: 0, y: 0 }
      const vbW = w / zoom
      const vbH = h / zoom
      const x = cv.x || 0
      const y = cv.y || 0
      window.currentViewBox = { x, y, width: vbW, height: vbH }
      const el = svgRef.current
      if (el) el.setAttribute('viewBox', `${x} ${y} ${vbW} ${vbH}`)
    }

    const sync = () => {
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      applyImperative(w, h)
    }

    sync()
    setSvgReady(true)

    window.addEventListener('resize', sync)

    let ro
    if (typeof ResizeObserver !== 'undefined' && svgRef.current) {
      ro = new ResizeObserver(sync)
      ro.observe(svgRef.current)
    }

    return () => {
      window.removeEventListener('resize', sync)
      if (ro) ro.disconnect()
    }
  }, [])

  // Close icon sidebar when clicking on canvas without an icon ready to place
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const handleCanvasClick = () => {
      const activeTool = useSketchStore.getState().activeTool
      // If icon tool is active but no icon is queued for placement, close the sidebar
      if (activeTool === TOOLS.ICON && !window.isIconToolActive) {
        useSketchStore.getState().setActiveTool(TOOLS.SELECT)
      }
    }

    svg.addEventListener('pointerdown', handleCanvasClick)
    return () => svg.removeEventListener('pointerdown', handleCanvasClick)
  }, [svgReady])

  // Initialize the imperative sketch engine on this SVG element
  useSketchEngine(svgRef, svgReady)

  // Restore the user's grid preference after client hydration.
  useEffect(() => {
    hydrateGrid()
    hydrateRulers()
  }, [hydrateGrid, hydrateRulers])

  // Expose grid state to engine
  useEffect(() => {
    window.__gridEnabled = gridEnabled
  }, [gridEnabled])

  return (
    <>
    <svg
      id="freehand-canvas"
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      style={{
        background: canvasBackground,
        cursor,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
      preserveAspectRatio="none"
      suppressHydrationWarning
    >
      {gridEnabled && (
        <defs>
          <pattern
            id="grid-small"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.5"
            />
          </pattern>
          <pattern
            id="grid-large"
            width={GRID_SIZE * 5}
            height={GRID_SIZE * 5}
            patternUnits="userSpaceOnUse"
          >
            <rect width={GRID_SIZE * 5} height={GRID_SIZE * 5} fill="url(#grid-small)" />
            <path
              d={`M ${GRID_SIZE * 5} 0 L 0 0 0 ${GRID_SIZE * 5}`}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="0.8"
            />
          </pattern>
        </defs>
      )}
      {gridEnabled && (
        <rect
          x="-100000"
          y="-100000"
          width="200000"
          height="200000"
          fill="url(#grid-large)"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
    <CanvasRulers enabled={rulersEnabled} svgRef={svgRef} unit={rulerUnit} />
    </>
  )
}
