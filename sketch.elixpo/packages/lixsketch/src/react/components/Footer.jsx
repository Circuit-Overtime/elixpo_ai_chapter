"use client"

import useSketchStore from '../store/useSketchStore'
import { useCallback } from 'react'

export default function Footer() {
  const zoom = useSketchStore((s) => s.zoom)
  const setZoom = useSketchStore((s) => s.setZoom)
  const viewMode = useSketchStore((s) => s.viewMode)
  const zenMode = useSketchStore((s) => s.zenMode)

  const zoomPercent = Math.round(zoom * 100)

  const handleZoomIn = useCallback(() => {
    if (window.zoomFromCenter) window.zoomFromCenter(1)
  }, [])

  const handleZoomOut = useCallback(() => {
    if (window.zoomFromCenter) window.zoomFromCenter(-1)
  }, [])

  const handleZoomReset = useCallback(() => {
    if (window.zoomReset) window.zoomReset()
  }, [])

  const handleZoomFit = useCallback(() => {
    if (window.zoomFit) window.zoomFit()
  }, [])

  const handleUndo = useCallback(() => {
    if (window.undo) window.undo()
  }, [])

  const handleRedo = useCallback(() => {
    if (window.redo) window.redo()
  }, [])

  if (viewMode || zenMode) return null

  return (
    <div className="absolute bottom-4 right-5 flex items-center gap-2.5 z-[1000] font-[lixFont]">
      {/* Undo/Redo */}
      <div className="flex items-center bg-surface rounded-lg overflow-hidden">
        <button
          onClick={handleUndo}
          title="Undo (Ctrl+Z)"
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-undo text-lg" />
        </button>
        <div className="w-px h-5 bg-border-light" />
        <button
          onClick={handleRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-redo text-lg" />
        </button>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center bg-surface rounded-lg overflow-hidden">
        <button
          onClick={handleZoomFit}
          aria-label="Fit canvas to content"
          title="Fit to Content (Shift+1)"
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-target-lock text-lg" />
        </button>
        <div className="w-px h-5 bg-border-light" />
        <button
          onClick={handleZoomOut}
          title="Zoom Out (Ctrl+-)"
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-minus text-lg" />
        </button>
        <div className="w-px h-5 bg-border-light" />
        <button
          onClick={handleZoomReset}
          title="Reset Zoom (Ctrl+0)"
          className="min-w-[52px] h-9 flex items-center justify-center text-text-secondary text-sm px-2 hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          {zoomPercent}%
        </button>
        <div className="w-px h-5 bg-border-light" />
        <button
          onClick={handleZoomIn}
          title="Zoom In (Ctrl++)"
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-plus text-lg" />
        </button>
      </div>
    </div>
  )
}
