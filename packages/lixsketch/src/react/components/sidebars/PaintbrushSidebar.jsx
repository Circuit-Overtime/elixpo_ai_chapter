"use client"

import useSketchStore, { TOOLS } from '../../store/useSketchStore'
import ShapeSidebar, { ToolbarButton, Divider, LayerControls } from './ShapeSidebar'
import { useState, useCallback } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

const STROKE_COLORS = ['#1a1a20', '#ffffff', '#FF8383', '#3A994C', '#56A2E8', '#FFD700', '#FF69B4', '#A855F7']

// Map taper UI values to perfect-freehand thinning values
const TAPER_MAP = { uniform: 0, pen: 0.5, brush: 0.8 }

function ColorGrid({ colors, selected, onSelect }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {colors.map((c) => (
        <button key={c} onClick={() => onSelect(c)}
          className={`w-7 h-7 rounded-md border-[1.5px] transition-all duration-100 ${selected === c ? 'border-[#7667a8] scale-110' : 'border-white/[0.08] hover:border-white/20'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

export default function PaintbrushSidebar() {
  const { t } = useTranslation()
  const activeTool = useSketchStore((s) => s.activeTool)
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const [strokeColor, setStrokeColor] = useState('#fff')
  const [thickness, setThickness] = useState(2)
  const [lineStyle, setLineStyle] = useState('solid')
  const [taper, setTaper] = useState('uniform')
  const [roughness, setRoughness] = useState('smooth')
  const [opacity, setOpacity] = useState(1)

  const updateStroke = useCallback((v) => { setStrokeColor(v); if (window.updateSelectedFreehandStyle) window.updateSelectedFreehandStyle({ stroke: v }) }, [])
  const updateThickness = useCallback((v) => { setThickness(v); if (window.updateSelectedFreehandStyle) window.updateSelectedFreehandStyle({ strokeWidth: v }) }, [])
  const updateTaper = useCallback((v) => { setTaper(v); if (window.updateSelectedFreehandStyle) window.updateSelectedFreehandStyle({ thinning: TAPER_MAP[v] }) }, [])
  const updateRoughness = useCallback((v) => { setRoughness(v); if (window.updateSelectedFreehandStyle) window.updateSelectedFreehandStyle({ roughness: v }) }, [])
  const updateOpacity = useCallback((v) => { setOpacity(v); if (window.updateSelectedFreehandStyle) window.updateSelectedFreehandStyle({ opacity: v }) }, [])

  return (
    <ShapeSidebar visible={activeTool === TOOLS.FREEHAND || activeTool === TOOLS.DRAW_SHAPE || selectedShapeSidebar === 'paintbrush'}>
      <ToolbarButton tooltip={t('sidebar.strokeColor')}
        preview={<span className="w-4 h-4 rounded-md border border-white/20" style={{ backgroundColor: strokeColor }} />}
      >
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.stroke')}</p>
        <ColorGrid colors={STROKE_COLORS} selected={strokeColor} onSelect={updateStroke} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-edit-alt" tooltip={t('sidebar.strokeWidth')}>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.width')}</p>
        <div className="flex items-center gap-1">
          {[1, 2, 4, 7].map((w) => (
            <button key={w} onClick={() => updateThickness(w)}
              className={`w-9 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${thickness === w ? 'bg-[#7667a8]/20 text-[#7667a8]' : 'text-text-muted hover:bg-white/[0.06]'}`}
            >
              <div className="w-5 rounded-full bg-current" style={{ height: Math.max(1, w) }} />
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-pen" tooltip="Taper">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.taper')}</p>
        <div className="flex flex-col gap-0.5">
          {[
            { v: 'uniform', i: 'bxs-minus-circle', l: 'Uniform' },
            { v: 'pen', i: 'bxs-pen', l: 'Pen' },
            { v: 'brush', i: 'bxs-brush', l: 'Brush' },
          ].map((t) => (
            <button key={t.v} onClick={() => updateTaper(t.v)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${taper === t.v ? 'bg-[#7667a8] text-white' : 'text-text-secondary hover:bg-white/[0.06]'}`}
            >
              <i className={`bx ${t.i} text-sm`} /> {t.l}
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-shape-polygon" tooltip="Roughness">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.roughness')}</p>
        <div className="flex flex-col gap-0.5">
          {[
            { v: 'smooth', i: 'bxs-droplet', l: 'Smooth' },
            { v: 'medium', i: 'bxs-leaf', l: 'Medium' },
            { v: 'rough', i: 'bxs-bolt', l: 'Rough' },
          ].map((r) => (
            <button key={r.v} onClick={() => updateRoughness(r.v)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${roughness === r.v ? 'bg-[#7667a8] text-white' : 'text-text-secondary hover:bg-white/[0.06]'}`}
            >
              <i className={`bx ${r.i} text-sm`} /> {r.l}
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-sun" tooltip={t('sidebar.opacity')}>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Opacity {Math.round(opacity * 100)}%</p>
        <input
          type="range" min="0" max="1" step="0.05" value={opacity}
          onChange={(e) => updateOpacity(parseFloat(e.target.value))}
          className="w-28 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#7667a8]"
        />
      </ToolbarButton>
      <Divider />
      <LayerControls />
    </ShapeSidebar>
  )
}
