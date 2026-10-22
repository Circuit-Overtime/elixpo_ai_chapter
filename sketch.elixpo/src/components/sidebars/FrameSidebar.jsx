"use client"

import useSketchStore, { TOOLS } from '@/store/useSketchStore'
import useUIStore from '@/store/useUIStore'
import ShapeSidebar, { ToolbarButton, Divider, LayerControls } from './ShapeSidebar'
import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { compressImage } from '@/utils/imageCompressor'
// Imported from the package's utility subpath rather than the package
// root. The root re-exports saveScene/loadScene from SceneSerializer,
// which statically imports every shape module — those reference bare
// `rough` / `svg` globals that only exist after engine.init() runs.
// Pulling the constants from the root crashes the page with
// "rough is not defined" at module evaluation time.
import { IMAGE_ACCEPT_ATTR, isAllowedImage } from '@elixpo/lixsketch/src/utils/allowedImageTypes.js'

const FILL_STYLES = [
  { id: 'transparent', label: 'None', icon: 'bx-x' },
  { id: 'solid', label: 'Solid', icon: 'bxs-square' },
  { id: 'grid', label: 'Grid', icon: 'bx-grid-alt' },
]

const FILL_COLORS = [
  '#1e1e28',
  '#15111f',
  '#1a1a2e',
  '#0d1117',
  '#2d2d3a',
  '#ffffff',
]

export default function FrameSidebar() {
  const { t } = useTranslation()
  const activeTool = useSketchStore((s) => s.activeTool)
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const toggleAIModal = useUIStore((s) => s.toggleAIModal)
  const [frameName, setFrameName] = useState('Frame 1')
  const [isGraph, setIsGraph] = useState(false)
  const [fillStyle, setFillStyle] = useState('transparent')
  const [fillColor, setFillColor] = useState('#1e1e28')

  // Sync state from the actual selected frame when sidebar opens
  useEffect(() => {
    if (selectedShapeSidebar === 'frame' || activeTool === TOOLS.FRAME) {
      const shape = typeof window !== 'undefined' ? window.currentShape : null
      if (shape && shape.shapeName === 'frame') {
        if (shape.frameName) setFrameName(shape.frameName)
        setIsGraph(shape._frameType === 'graph')
        setFillStyle(shape.fillStyle || 'transparent')
        setFillColor(shape.fillColor || '#1e1e28')
      } else {
        setIsGraph(false)
        setFillStyle('transparent')
        setFillColor('#1e1e28')
      }
    }
  }, [selectedShapeSidebar, activeTool])

  const updateName = useCallback((e) => {
    const name = e.target.value
    setFrameName(name)
    const shape = window.currentShape
    if (shape && shape.shapeName === 'frame') {
      shape.frameName = name
      shape.draw()
    }
  }, [])

  const updateFillStyle = useCallback((style) => {
    setFillStyle(style)
    const shape = window.currentShape
    if (shape && shape.shapeName === 'frame') {
      shape.fillStyle = style
      shape.draw()
    }
  }, [])

  const updateFillColor = useCallback((color) => {
    setFillColor(color)
    const shape = window.currentShape
    if (shape && shape.shapeName === 'frame') {
      shape.fillColor = color
      shape.draw()
    }
  }, [])

  const resizeToFit = useCallback(() => {
    const shape = window.currentShape
    if (shape && shape.shapeName === 'frame' && typeof shape.resizeToFitContents === 'function') {
      shape.resizeToFitContents()
    }
  }, [])

  const handleAIEdit = useCallback(() => {
    const shape = window.currentShape
    if (shape && shape.shapeName === 'frame') {
      window.__aiEditTargetFrame = shape
      toggleAIModal()
    }
  }, [toggleAIModal])

  return (
    <ShapeSidebar visible={activeTool === TOOLS.FRAME || selectedShapeSidebar === 'frame'}>
      <ToolbarButton icon="bxs-rename" tooltip="Frame name">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.name')}</p>
        <input
          type="text"
          value={frameName}
          onChange={updateName}
          className="w-32 px-2.5 py-1.5 bg-surface-hover border border-border-light rounded-lg text-text-primary text-xs outline-none focus:border-[#7667a8]/50 transition-all duration-150 font-[lixFont]"
          spellCheck={false}
        />
      </ToolbarButton>

      <Divider />

      {/* Fill style */}
      <ToolbarButton icon="bxs-palette" tooltip="Fill style">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.background')}</p>
        <div className="flex gap-1 mb-2.5">
          {FILL_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => updateFillStyle(s.id)}
              title={s.label}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${
                fillStyle === s.id
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              <i className={`bx ${s.icon} text-sm`} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Color picker — only show for solid/grid */}
        {fillStyle !== 'transparent' && (
          <>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1.5">{t('sidebar.sectionHeader.color')}</p>
            <div className="flex items-center gap-1.5">
              {FILL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateFillColor(c)}
                  title={c}
                  className={`w-6 h-6 rounded-md border-2 transition-all duration-100 ${
                    fillColor === c ? 'border-accent-blue scale-110' : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label className="w-6 h-6 rounded-md border-2 border-white/10 hover:border-white/30 cursor-pointer overflow-hidden relative transition-all duration-100" title="Custom color">
                <input
                  type="color"
                  value={fillColor}
                  onChange={(e) => updateFillColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <i className="bx bx-palette text-xs text-text-muted absolute inset-0 flex items-center justify-center" />
              </label>
            </div>
          </>
        )}
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bx-image-alt" tooltip="Background image">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.backgroundImage')}</p>
        <div className="flex gap-1.5 mb-2">
          <button
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = IMAGE_ACCEPT_ATTR
              input.onchange = async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (!isAllowedImage(file)) {
                  console.warn('[FrameSidebar] Rejected file type:', file.type)
                  return
                }
                const reader = new FileReader()
                reader.onload = async (ev) => {
                  const shape = window.currentShape
                  if (!shape?.shapeName === 'frame' || !shape.setImageFromURL) return
                  // Compress heavily before setting
                  try {
                    const compressed = await compressImage(ev.target.result, { maxWidth: 1280, quality: 0.5 })
                    shape.setImageFromURL(compressed.dataUrl, shape._frameImageFit || 'cover')
                  } catch {
                    shape.setImageFromURL(ev.target.result, shape._frameImageFit || 'cover')
                  }
                }
                reader.readAsDataURL(file)
              }
              input.click()
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-text-secondary text-xs hover:bg-surface-hover hover:text-text-primary transition-all duration-100"
          >
            <i className="bx bx-upload text-sm" />
            Set Image
          </button>
          <button
            onClick={() => {
              const shape = window.currentShape
              if (shape?.shapeName === 'frame' && shape.setImageFromURL) {
                shape.setImageFromURL(null)
                shape.draw()
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-text-secondary text-xs hover:bg-surface-hover hover:text-red-400 transition-all duration-100"
          >
            <i className="bx bx-x text-sm" />
            Remove
          </button>
        </div>
        {/* Fit controls — only show when frame has an image */}
        {(() => {
          const shape = typeof window !== 'undefined' ? window.currentShape : null
          if (!shape?.shapeName === 'frame' || !shape?._frameImageURL) return null
          return (
            <>
              <p className="text-xs text-text-muted uppercase tracking-wider mb-1.5">{t('sidebar.sectionHeader.fit')}</p>
              <div className="flex gap-1">
                {[
                  { id: 'cover', label: 'Cover' },
                  { id: 'contain', label: 'Contain' },
                  { id: 'fill', label: 'Stretch' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      const s = window.currentShape
                      if (s?.shapeName === 'frame' && s.setImageFromURL && s._frameImageURL) {
                        s.setImageFromURL(s._frameImageURL, f.id)
                      }
                    }}
                    className={`px-2 py-1 rounded-md text-[10px] transition-all ${
                      shape._frameImageFit === f.id
                        ? 'bg-accent-blue/20 text-accent-blue'
                        : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                    }`}
                  >{f.label}</button>
                ))}
              </div>
            </>
          )
        })()}
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-expand" tooltip="Actions">
        <button onClick={resizeToFit} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-text-secondary text-xs hover:bg-surface-hover hover:text-text-primary transition-all duration-100">
          <i className="bx bxs-expand text-sm" />
          Resize to Fit
        </button>
      </ToolbarButton>

      {/* AI Edit / Graph Edit removed while AI is coming-soon. Restore the
          button + handleAIEdit wiring when the assistant ships. */}
      <Divider />
      <LayerControls />
    </ShapeSidebar>
  )
}
