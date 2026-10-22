"use client"

import useSketchStore from '@/store/useSketchStore'
import useUIStore from '@/store/useUIStore'
import ShapeSidebar, { Divider, LayerControls } from './ShapeSidebar'
import { useCallback } from 'react'

export default function ImageSidebar() {
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const toggleAIModal = useUIStore((s) => s.toggleAIModal)
  const isGraph = typeof window !== 'undefined' && window.currentShape?._frameType === 'graph'

  const handleEditGraph = useCallback(() => {
    const shape = window.currentShape
    if (!shape || shape._frameType !== 'graph') return
    window.__aiEditTargetFrame = shape
    toggleAIModal()
  }, [toggleAIModal])

  const handleReplace = useCallback(() => {
    if (window.openImageFilePicker) {
      // Store current shape so the new image replaces it
      window.__replaceImageShape = window.currentShape
      window.openImageFilePicker()
    }
  }, [])

  return (
    <ShapeSidebar visible={selectedShapeSidebar === 'image'}>
      {isGraph && (
        <>
          <button
            onClick={handleEditGraph}
            title="Edit graph"
            className="h-9 flex cursor-pointer items-center gap-1.5 px-3 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all duration-100"
          >
            <i className="bx bx-line-chart text-base" />
            <span className="text-xs">Edit graph</span>
          </button>
          <Divider />
        </>
      )}

      {!isGraph && (
        <>
          <button
            onClick={handleReplace}
            title="Replace image"
            className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-100"
          >
            <i className="bx bx-upload text-base" />
            <span className="text-xs">Replace</span>
          </button>
          <Divider />
        </>
      )}

      {/* Layer controls */}
      <LayerControls />
    </ShapeSidebar>
  )
}
