"use client"

import useSketchStore, { TOOLS } from '../../store/useSketchStore'
import ShapeSidebar, { ToolbarButton, Divider, LayerControls } from './ShapeSidebar'
import { useState, useCallback } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import useUIStore from '../../store/useUIStore'

const STROKE_COLORS = ['#000000', '#ffffff', '#FF8383', '#3A994C', '#56A2E8', '#FFD700', '#FF69B4', '#A855F7']
const BG_COLORS = ['transparent', '#f0f0f0', '#ffcccb', '#90ee90', '#add8e6', '#FFE4B5', '#DDA0DD', '#2d2d2d']

const FILLS = [
  { value: 'hachure', label: 'sidebar.fill.hachure' },
  { value: 'solid', label: 'sidebar.fill.solid' },
  { value: 'dots', label: 'sidebar.fill.dots' },
  { value: 'cross-hatch', label: 'sidebar.fill.cross' },
  { value: 'transparent', label: 'sidebar.fill.none' },
]

function ColorGrid({ colors, selected, onSelect }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {colors.map((c) => {
        const isTrans = c === 'transparent'
        return (
          <button
            key={c}
            onClick={() => onSelect(c)}
            className={`w-7 h-7 rounded-md border-[1.5px] transition-all duration-100 ${
              selected === c ? 'border-[#7667a8] scale-110' : 'border-white/[0.08] hover:border-white/20'
            }`}
            style={!isTrans ? { backgroundColor: c } : undefined}
          >
            {isTrans && (
              <svg className="w-full h-full text-text-dim" viewBox="0 0 20 20">
                <line x1="4" y1="16" x2="16" y2="4" stroke="currentColor" strokeWidth="2" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function RectangleSidebar() {
  const { t } = useTranslation()
  const activeTool = useSketchStore((s) => s.activeTool)
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const theme = useUIStore((s) => s.theme)
  const resolvedTheme = theme === 'system' && typeof window !== 'undefined'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme
  const [strokeColor, setStrokeColor] = useState(null)
  const displayedStrokeColor = strokeColor ?? (resolvedTheme === 'light' ? '#000000' : '#ffffff')
  const [bgColor, setBgColor] = useState('transparent')
  const [thickness, setThickness] = useState(2)
  const [lineStyle, setLineStyle] = useState('solid')
  const [fillStyle, setFillStyle] = useState('hachure')

  const update = useCallback((changes, localSetters) => {
    Object.entries(localSetters).forEach(([, fn]) => fn())
    if (window.updateSelectedRectStyle) window.updateSelectedRectStyle(changes)
  }, [])

  const updateStroke = useCallback((v) => { setStrokeColor(v); if (window.updateSelectedRectStyle) window.updateSelectedRectStyle({ stroke: v }) }, [])
  const updateBg = useCallback((v) => { setBgColor(v); if (window.updateSelectedRectStyle) window.updateSelectedRectStyle({ fill: v }) }, [])
  const updateThickness = useCallback((v) => { setThickness(v); if (window.updateSelectedRectStyle) window.updateSelectedRectStyle({ strokeWidth: v }) }, [])
  const updateStyle = useCallback((v) => { setLineStyle(v); if (window.updateSelectedRectStyle) window.updateSelectedRectStyle({ outlineStyle: v }) }, [])
  const updateFill = useCallback((v) => { setFillStyle(v); if (window.updateSelectedRectStyle) window.updateSelectedRectStyle({ fillStyle: v }) }, [])

  return (
    <ShapeSidebar visible={activeTool === TOOLS.RECTANGLE || selectedShapeSidebar === 'rectangle'}>
      {/* Stroke color */}
      <ToolbarButton
        tooltip={t('sidebar.strokeColor')}
        preview={<span className="w-4 h-4 rounded-md border border-white/20" style={{ backgroundColor: displayedStrokeColor }} />}
      >
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.stroke')}</p>
        <ColorGrid colors={STROKE_COLORS} selected={displayedStrokeColor} onSelect={updateStroke} />
      </ToolbarButton>

      <Divider />

      {/* Background */}
      <ToolbarButton
        tooltip={t('sidebar.fillColor')}
        preview={
          <span className="w-4 h-4 rounded-md border border-white/20" style={{ backgroundColor: bgColor === 'transparent' ? 'transparent' : bgColor }}>
            {bgColor === 'transparent' && (
              <svg className="w-full h-full text-text-dim" viewBox="0 0 16 16"><line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" /></svg>
            )}
          </span>
        }
      >
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.background')}</p>
        <ColorGrid colors={BG_COLORS} selected={bgColor} onSelect={updateBg} />
      </ToolbarButton>

      <Divider />

      {/* Thickness */}
      <ToolbarButton icon="bxs-edit-alt" tooltip={t('sidebar.strokeWidth')}>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.width')}</p>
        <div className="flex items-center gap-1">
          {[1, 2, 4, 7].map((w) => (
            <button
              key={w}
              onClick={() => updateThickness(w)}
              className={`w-9 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${
                thickness === w ? 'bg-[#7667a8]/20 text-[#7667a8]' : 'text-text-muted hover:bg-white/[0.06]'
              }`}
            >
              <div className="w-5 rounded-full bg-current" style={{ height: Math.max(1, w) }} />
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      {/* Stroke style */}
      <ToolbarButton icon="bxs-minus-circle" tooltip="Stroke style">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.style')}</p>
        <div className="flex items-center gap-1">
          {[
            { v: 'solid', d: '' },
            { v: 'dashed', d: '6 4' },
            { v: 'dotted', d: '2 3' },
          ].map((s) => (
            <button
              key={s.v}
              onClick={() => updateStyle(s.v)}
              className={`w-11 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${
                lineStyle === s.v ? 'bg-[#7667a8]/20' : 'hover:bg-white/[0.06]'
              }`}
            >
              <svg width="28" height="4" viewBox="0 0 28 4">
                <line x1="0" y1="2" x2="28" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray={s.d} strokeLinecap="round" />
              </svg>
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      {/* Fill pattern */}
      <ToolbarButton icon="bxs-brush" tooltip="Fill style">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.fill')}</p>
        <div className="flex flex-col gap-0.5">
          {FILLS.map((f) => (
            <button
              key={f.value}
              onClick={() => updateFill(f.value)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${
                fillStyle === f.value ? 'bg-[#7667a8] text-white' : 'text-text-secondary hover:bg-white/[0.06]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {t(f.label)}
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />
      <LayerControls />
    </ShapeSidebar>
  )
}
