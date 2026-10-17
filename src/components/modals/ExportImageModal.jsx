"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import useUIStore from '@/store/useUIStore'
import useSketchStore from '@/store/useSketchStore'
import {
  canvasToLosslessPNG,
  createExportSVG,
  downloadBlob,
  getExportBackground,
  renderExportCanvas,
} from '@/utils/canvasExport'

const SCALES = [1, 2, 4, 8]

export default function ExportImageModal() {
  const open = useUIStore((s) => s.exportImageModalOpen)
  const toggleModal = useUIStore((s) => s.toggleExportImageModal)
  const resolvedTheme = useUIStore((s) => s.resolvedTheme)
  const canvasBackground = useSketchStore((s) => s.canvasBackground)

  const [scale, setScale] = useState(4)
  const [bgMode, setBgMode] = useState(resolvedTheme) // 'dark' | 'light' | 'none'
  const [previewUrl, setPreviewUrl] = useState(null)
  const previewRef = useRef(null)

  const getBgColor = useCallback(() => {
    return getExportBackground(bgMode, resolvedTheme, canvasBackground)
  }, [bgMode, canvasBackground, resolvedTheme])

  useEffect(() => {
    if (open) setBgMode(resolvedTheme)
  }, [open, resolvedTheme])

  // Generate preview whenever settings change
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const generate = async () => {
      const clone = createExportSVG(bgMode, resolvedTheme, canvasBackground)
      if (!clone) return
      // Preview at 1x for speed
      const canvas = await renderExportCanvas(clone, 1)
      if (cancelled || !canvas) return
      setPreviewUrl(canvas.toDataURL('image/png'))
    }
    generate()

    return () => { cancelled = true }
  }, [open, bgMode, resolvedTheme, canvasBackground])

  if (!open) return null

  const handleExportPNG = async () => {
    const clone = createExportSVG(bgMode, resolvedTheme, canvasBackground)
    if (!clone) return
    const canvas = await renderExportCanvas(clone, scale)
    const blob = await canvasToLosslessPNG(canvas)
    downloadBlob(blob, `lixsketch-export-${scale}x.png`)
    toggleModal()
  }

  const handleExportSVG = () => {
    const clone = createExportSVG(bgMode, resolvedTheme, canvasBackground)
    if (!clone) return
    const svgData = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    downloadBlob(blob, 'lixsketch-export.svg')
    toggleModal()
  }

  const handleCopyPNG = async () => {
    const clone = createExportSVG(bgMode, resolvedTheme, canvasBackground)
    if (!clone) return
    const canvas = await renderExportCanvas(clone, scale)
    const blob = await canvasToLosslessPNG(canvas)
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': blob })])
      .catch((err) => console.warn('Clipboard write failed:', err))
    toggleModal()
  }

  const handleCopySVG = () => {
    const clone = createExportSVG(bgMode, resolvedTheme, canvasBackground)
    if (!clone) return
    const svgData = new XMLSerializer().serializeToString(clone)
    navigator.clipboard.writeText(svgData).catch((err) =>
      console.warn('Clipboard write failed:', err)
    )
    toggleModal()
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center font-[lixFont]"
      onClick={toggleModal}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-surface-card border border-border-light rounded-2xl w-full max-w-[720px] mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-text-primary text-base font-medium">Export Image</h2>
          <button
            onClick={toggleModal}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200"
          >
            <i className="bx bx-x text-xl" />
          </button>
        </div>

        <hr className="border-border-light mx-6" />

        {/* Body - two columns */}
        <div className="flex gap-0">
          {/* Left - Preview */}
          <div className="flex-1 p-6 flex items-center justify-center min-h-[300px]">
            <div
              ref={previewRef}
              className="w-full max-h-[320px] rounded-xl overflow-hidden border border-border-light flex items-center justify-center"
              style={{ background: bgMode === 'none' ? 'repeating-conic-gradient(#2a2a35 0% 25%, #1e1e28 0% 50%) 0 0 / 16px 16px' : getBgColor() }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Export preview"
                  className="w-full h-full object-contain max-h-[320px]"
                />
              ) : (
                <span className="text-text-dim text-xs">Generating preview...</span>
              )}
            </div>
          </div>

          {/* Right - Controls */}
          <div className="w-[240px] border-l border-border-light p-5 flex flex-col gap-5">
            {/* Background */}
            <div>
              <p className="text-text-dim text-xs uppercase tracking-wider mb-2">Background</p>
              <div className="flex items-center gap-1">
                {[
                  { value: 'dark', label: 'Dark', icon: 'bxs-moon' },
                  { value: 'light', label: 'Light', icon: 'bxs-sun' },
                  { value: 'none', label: 'None', icon: 'bx-hide' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setBgMode(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition-all duration-200 ${
                      bgMode === opt.value
                        ? 'bg-accent text-text-primary'
                        : 'text-text-muted hover:bg-surface-hover'
                    }`}
                  >
                    <i className={`bx ${opt.icon} text-xs`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scale */}
            <div>
              <p className="text-text-dim text-xs uppercase tracking-wider mb-2">Scale</p>
              <div className="flex items-center gap-1">
                {SCALES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    className={`flex-1 py-1.5 rounded-lg text-xs transition-all duration-200 ${
                      scale === s
                        ? 'bg-accent text-text-primary'
                        : 'text-text-muted hover:bg-surface-hover'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <p className="text-text-dim text-[10px] mt-2 leading-relaxed">
                Lossless PNG at full selected resolution.
              </p>
            </div>

            <hr className="border-border-light" />

            {/* Export buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleExportPNG}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent-blue hover:bg-accent-blue-hover text-text-primary text-xs transition-all duration-200"
              >
                <i className="bx bx-image text-sm" />
                Export as PNG
              </button>
              <button
                onClick={handleExportSVG}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover border border-border text-text-secondary text-xs transition-all duration-200"
              >
                <i className="bx bx-code-alt text-sm" />
                Export as SVG
              </button>
            </div>

            <hr className="border-border-light" />

            {/* Clipboard buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleCopyPNG}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary text-xs hover:bg-surface-hover border border-border transition-all duration-200"
              >
                <i className="bx bx-clipboard text-sm" />
                Copy as PNG
              </button>
              <button
                onClick={handleCopySVG}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary text-xs hover:bg-surface-hover border border-border transition-all duration-200"
              >
                <i className="bx bx-copy text-sm" />
                Copy as SVG
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
