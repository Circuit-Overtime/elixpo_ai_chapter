"use client"

import { useEffect, useMemo, useState } from 'react'
import { formatRulerValue, normalizeRulerUnit } from './rulerUnits.js'

const GRID_SIZE = 20
const MIN_LABEL_GAP = 52
const RULER_SIZE = 26

function getRulerStep(zoom) {
  const requiredMultiple = MIN_LABEL_GAP / Math.max(zoom * GRID_SIZE, 0.001)
  const power = 10 ** Math.floor(Math.log10(Math.max(1, requiredMultiple)))
  for (const factor of [1, 2, 5, 10]) {
    const multiple = factor * power
    if (multiple >= requiredMultiple) return GRID_SIZE * multiple
  }
  return GRID_SIZE
}

function buildTicks(start, extent, zoom, step) {
  const first = Math.floor(start / step) * step
  const last = start + extent / zoom
  const ticks = []
  for (let value = first; value <= last + step; value += step) {
    ticks.push({ value, position: (value - start) * zoom })
  }
  return ticks
}

export default function CanvasRulers({ enabled, svgRef, unit = 'px' }) {
  const rulerUnit = normalizeRulerUnit(unit)
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1, width: 0, height: 0, rulerLeft: 64, rulerTop: 48 })
  const [pointer, setPointer] = useState({ x: 0, y: 0, visible: false })

  useEffect(() => {
    if (!enabled) return undefined
    let frameId
    let previous = ''
    const sync = () => {
      const svg = svgRef.current
      if (svg) {
        const rect = svg.getBoundingClientRect()
        const hostRect = svg.parentElement?.getBoundingClientRect?.() || rect
        const toolbarRect = document.querySelector('[data-canvas-toolbar]')?.getBoundingClientRect?.()
        const headerRect = document.querySelector('header')?.getBoundingClientRect?.()
        const viewBox = window.currentViewBox || svg.viewBox?.baseVal
        const zoom = Number(window.currentZoom) || (viewBox?.width ? rect.width / viewBox.width : 1)
        const next = {
          x: Number(viewBox?.x) || 0,
          y: Number(viewBox?.y) || 0,
          zoom: Math.max(0.001, zoom),
          width: rect.width,
          height: rect.height,
          rulerLeft: Math.max(0, Math.min(hostRect.width - RULER_SIZE, toolbarRect ? toolbarRect.right - hostRect.left + 8 : 64)),
          rulerTop: Math.max(0, headerRect ? headerRect.bottom - hostRect.top : 48),
        }
        const signature = `${next.x}|${next.y}|${next.zoom}|${next.width}|${next.height}|${next.rulerLeft}|${next.rulerTop}`
        if (signature !== previous) {
          previous = signature
          setViewport(next)
        }
      }
      frameId = requestAnimationFrame(sync)
    }
    frameId = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(frameId)
  }, [enabled, svgRef])

  useEffect(() => {
    if (!enabled) return undefined
    const svg = svgRef.current
    if (!svg) return undefined
    let frameId
    const trackPointer = (event) => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        const hostRect = svg.parentElement?.getBoundingClientRect?.() || svg.getBoundingClientRect()
        const x = event.clientX - hostRect.left
        const y = event.clientY - hostRect.top
        setPointer({ x, y, visible: x >= 0 && y >= 0 && x <= hostRect.width && y <= hostRect.height })
      })
    }
    const hidePointer = () => setPointer((current) => ({ ...current, visible: false }))
    svg.addEventListener('pointermove', trackPointer)
    svg.addEventListener('pointerleave', hidePointer)
    return () => {
      cancelAnimationFrame(frameId)
      svg.removeEventListener('pointermove', trackPointer)
      svg.removeEventListener('pointerleave', hidePointer)
    }
  }, [enabled, svgRef])

  const step = useMemo(() => getRulerStep(viewport.zoom), [viewport.zoom])
  const horizontalTicks = useMemo(() => buildTicks(viewport.x, viewport.width, viewport.zoom, step), [viewport.x, viewport.width, viewport.zoom, step])
  const verticalTicks = useMemo(() => buildTicks(viewport.y, viewport.height, viewport.zoom, step), [viewport.y, viewport.height, viewport.zoom, step])

  if (!enabled) return null

  const horizontalStart = viewport.rulerLeft + RULER_SIZE
  const verticalStart = viewport.rulerTop + RULER_SIZE
  const pointerInDrawingArea = pointer.visible && pointer.x >= horizontalStart && pointer.y >= verticalStart
  const pointerWorldX = viewport.x + pointer.x / viewport.zoom
  const pointerWorldY = viewport.y + pointer.y / viewport.zoom

  return (
    <div className="pointer-events-none absolute inset-0 z-[900] select-none text-text-muted" aria-hidden="true">
      <div className="absolute right-0 overflow-hidden border-b border-border-light bg-surface/95 shadow-sm backdrop-blur-sm" style={{ height: RULER_SIZE, left: horizontalStart, top: viewport.rulerTop }}>
        {horizontalTicks.map(({ value, position }) => (
          <div key={value} className="absolute bottom-0 h-2 border-l border-text-dim" style={{ left: position - horizontalStart }}>
            <span className="absolute bottom-2 left-1 font-mono text-[9px] leading-none tabular-nums">{formatRulerValue(value, rulerUnit)}</span>
          </div>
        ))}
        {pointerInDrawingArea && (
          <div className="absolute inset-y-0 border-l border-accent" style={{ left: pointer.x - horizontalStart }}>
            <span className="absolute left-1 top-1 rounded bg-accent px-1 font-mono text-[9px] leading-4 text-white shadow-sm">{formatRulerValue(pointerWorldX, rulerUnit, true)}</span>
          </div>
        )}
      </div>
      <div className="absolute bottom-0 overflow-hidden border-r border-border-light bg-surface/95 shadow-sm backdrop-blur-sm" style={{ width: RULER_SIZE, left: viewport.rulerLeft, top: verticalStart }}>
        {verticalTicks.map(({ value, position }) => (
          <div key={value} className="absolute right-0 w-2 border-t border-text-dim" style={{ top: position - verticalStart }}>
            <span className="absolute right-2 top-1 font-mono text-[9px] leading-none tabular-nums" style={{ transform: 'rotate(-90deg)', transformOrigin: 'top right' }}>{formatRulerValue(value, rulerUnit)}</span>
          </div>
        ))}
        {pointerInDrawingArea && (
          <div className="absolute inset-x-0 border-t border-accent" style={{ top: pointer.y - verticalStart }}>
            <span className="absolute right-1 top-1 rounded bg-accent px-1 font-mono text-[9px] leading-4 text-white shadow-sm" style={{ transform: 'rotate(-90deg)', transformOrigin: 'top right' }}>{formatRulerValue(pointerWorldY, rulerUnit, true)}</span>
          </div>
        )}
      </div>
      <div className="absolute border-b border-r border-border-light bg-accent/20" style={{ width: RULER_SIZE, height: RULER_SIZE, left: viewport.rulerLeft, top: viewport.rulerTop }}>
        <span className="absolute bottom-0.5 left-1 font-mono text-[8px] uppercase text-accent">{rulerUnit}</span>
        <span className="absolute left-1/2 top-1/2 h-2.5 -translate-x-1/2 -translate-y-1/2 border-l border-accent" />
        <span className="absolute left-1/2 top-1/2 w-2.5 -translate-x-1/2 -translate-y-1/2 border-t border-accent" />
      </div>
      {pointerInDrawingArea && (
        <>
          <div className="absolute bottom-0 border-l border-dashed border-accent/70" style={{ left: pointer.x, top: verticalStart }} />
          <div className="absolute right-0 border-t border-dashed border-accent/70" style={{ left: horizontalStart, top: pointer.y }} />
          <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-surface" style={{ left: pointer.x, top: pointer.y }} />
        </>
      )}
    </div>
  )
}
