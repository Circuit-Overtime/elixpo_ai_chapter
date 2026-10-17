"use client"

import useSketchStore, { TOOLS } from '@/store/useSketchStore'
import ShapeSidebar, { ToolbarButton, Divider, LayerControls } from './ShapeSidebar'
import { useState, useCallback } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import useUIStore from '@/store/useUIStore'

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
              selected === c ? 'border-accent-blue scale-110' : 'border-border-light hover:border-text-dim'
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

export default function CircleSidebar() {
  const { t } = useTranslation()
  const activeTool = useSketchStore((s) => s.activeTool)
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const resolvedTheme = useUIStore((s) => s.resolvedTheme)
  const [strokeColor, setStrokeColor] = useState(null)
  const displayedStrokeColor = strokeColor ?? (resolvedTheme === 'light' ? '#000000' : '#ffffff')
  const [bgColor, setBgColor] = useState('transparent')
  const [thickness, setThickness] = useState(2)
  const [lineStyle, setLineStyle] = useState('solid')
  const [fillStyle, setFillStyle] = useState('hachure')

  const updateStroke = useCallback((v) => { setStrokeColor(v); if (window.updateSelectedCircleStyle) window.updateSelectedCircleStyle({ stroke: v }) }, [])
  const updateBg = useCallback((v) => { setBgColor(v); if (window.updateSelectedCircleStyle) window.updateSelectedCircleStyle({ fill: v }) }, [])
  const updateThickness = useCallback((v) => { setThickness(v); if (window.updateSelectedCircleStyle) window.updateSelectedCircleStyle({ strokeWidth: v }) }, [])
  const updateStyle = useCallback((v) => { setLineStyle(v); if (window.updateSelectedCircleStyle) window.updateSelectedCircleStyle({ outlineStyle: v }) }, [])
  const updateFill = useCallback((v) => { setFillStyle(v); if (window.updateSelectedCircleStyle) window.updateSelectedCircleStyle({ fillStyle: v }) }, [])

  return (
    <ShapeSidebar visible={activeTool === TOOLS.CIRCLE || selectedShapeSidebar === 'circle'}>
      <ToolbarButton
        tooltip={t('sidebar.strokeColor')}
        preview={<span className="w-4 h-4 rounded-md border border-border-light" style={{ backgroundColor: displayedStrokeColor }} />}
      >
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.stroke')}</p>
        <ColorGrid colors={STROKE_COLORS} selected={displayedStrokeColor} onSelect={updateStroke} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        tooltip={t('sidebar.fillColor')}
        preview={
          <span className="w-4 h-4 rounded-md border border-border-light" style={{ backgroundColor: bgColor === 'transparent' ? 'transparent' : bgColor }}>
            {bgColor === 'transparent' && <svg className="w-full h-full text-text-dim" viewBox="0 0 16 16"><line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" /></svg>}
          </span>
        }
      >
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.background')}</p>
        <ColorGrid colors={BG_COLORS} selected={bgColor} onSelect={updateBg} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-edit-alt" tooltip={t('sidebar.strokeWidth')}>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.width')}</p>
        <div className="flex items-center gap-1">
          {[1, 2, 4, 7].map((w) => (
            <button key={w} onClick={() => updateThickness(w)}
              className={`w-9 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${thickness === w ? 'bg-[#7667a8]/20 text-[#7667a8]' : 'text-text-muted hover:bg-surface-hover'}`}
            >
              <div className="w-5 rounded-full bg-current" style={{ height: Math.max(1, w) }} />
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-minus-circle" tooltip="Stroke style">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.style')}</p>
        <div className="flex items-center gap-1">
          {[{ v: 'solid', d: '' }, { v: 'dashed', d: '6 4' }, { v: 'dotted', d: '2 3' }].map((s) => (
            <button key={s.v} onClick={() => updateStyle(s.v)}
              className={`w-11 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${lineStyle === s.v ? 'bg-[#7667a8]/20' : 'hover:bg-surface-hover'}`}
            >
              <svg width="28" height="4" viewBox="0 0 28 4"><line x1="0" y1="2" x2="28" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray={s.d} strokeLinecap="round" /></svg>
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-brush" tooltip="Fill style">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.fill')}</p>
        <div className="flex flex-col gap-0.5">
          {FILLS.map((f) => (
            <button key={f.value} onClick={() => updateFill(f.value)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${fillStyle === f.value ? 'bg-[#7667a8] text-white' : 'text-text-secondary hover:bg-surface-hover'}`}
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
