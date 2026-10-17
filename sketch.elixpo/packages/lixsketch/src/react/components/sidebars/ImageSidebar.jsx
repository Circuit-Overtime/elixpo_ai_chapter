"use client"

import useSketchStore from '../../store/useSketchStore'
import useUIStore from '../../store/useUIStore'
import ShapeSidebar, { Divider, LayerControls } from './ShapeSidebar'
import { useCallback } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

export default function ImageSidebar() {
  const { t } = useTranslation()
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const toggleImageGenerateModal = useUIStore((s) => s.toggleImageGenerateModal)
  const toggleAIModal = useUIStore((s) => s.toggleAIModal)
  const isGraph = typeof window !== 'undefined' && window.currentShape?._frameType === 'graph'

  const handleEditGraph = useCallback(() => {
    const shape = window.currentShape
    if (!shape || shape._frameType !== 'graph') return
    window.__aiEditTargetFrame = shape
    toggleAIModal()
  }, [toggleAIModal])

  const handleEditWithAI = useCallback(() => {
    const shape = window.currentShape
    if (!shape || shape.shapeName !== 'image') return

    // Get the image URL from the element
    const el = shape.element
    const href = el?.getAttribute('href') || el?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''
    const w = parseFloat(el?.getAttribute('width')) || 512
    const h = parseFloat(el?.getAttribute('height')) || 512

    // Store reference for the modal to pick up
    window.__editImageRef = { imageUrl: href, width: w, height: h, shape }
    toggleImageGenerateModal()
  }, [toggleImageGenerateModal])

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

      {/* Edit with AI */}
      {!isGraph && (
        <>
          <button
            onClick={handleEditWithAI}
            title="Edit with AI"
            className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-text-muted hover:text-purple-400 hover:bg-purple-500/10 transition-all duration-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
            </svg>
            <span className="text-xs">AI Edit</span>
          </button>
          <Divider />
          <button
            onClick={handleReplace}
            title="Replace image"
            className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-text-muted hover:text-white hover:bg-white/[0.06] transition-all duration-100"
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
