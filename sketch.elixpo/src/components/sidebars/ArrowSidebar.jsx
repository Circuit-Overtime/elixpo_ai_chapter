"use client"

import useSketchStore, { TOOLS } from '@/store/useSketchStore'
import ShapeSidebar, { ToolbarButton, Divider, LayerControls } from './ShapeSidebar'
import { useState, useCallback } from 'react'
import { useTranslation } from '@/hooks/useTranslation'

const STROKE_COLORS = ['#1a1a20', '#ffffff', '#FF8383', '#3A994C', '#56A2E8', '#FFD700', '#FF69B4', '#A855F7']

const HEAD_STYLES = [
  { value: 'default', svg: '<svg width="22" height="12" viewBox="0 0 24 14"><line x1="2" y1="7" x2="16" y2="7" stroke="#fff" stroke-width="2"/><polyline points="13,2 19,7 13,12" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>' },
  { value: 'square', svg: '<svg width="22" height="12" viewBox="0 0 24 14"><line x1="2" y1="7" x2="14" y2="7" stroke="#fff" stroke-width="2"/><rect x="14" y="3" width="6" height="8" fill="none" stroke="#fff" stroke-width="1.5"/></svg>' },
  { value: 'outline', svg: '<svg width="22" height="12" viewBox="0 0 24 14"><line x1="2" y1="7" x2="13" y2="7" stroke="#fff" stroke-width="2"/><polygon points="13,2 21,7 13,12" fill="none" stroke="#fff" stroke-width="1.5"/></svg>' },
  { value: 'solid', svg: '<svg width="22" height="12" viewBox="0 0 24 14"><line x1="2" y1="7" x2="13" y2="7" stroke="#fff" stroke-width="2"/><polygon points="13,2 21,7 13,12" fill="#fff"/></svg>' },
]

function SvgIcon({ svg }) {
  return <span dangerouslySetInnerHTML={{ __html: svg }} />
}

function ColorGrid({ colors, selected, onSelect }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {colors.map((c) => (
        <button key={c} onClick={() => onSelect(c)}
          className={`w-7 h-7 rounded-md border-[1.5px] transition-all duration-100 ${selected === c ? 'border-[#7667a8] scale-110' : 'border-border-light hover:border-text-dim'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

export default function ArrowSidebar() {
  const { t } = useTranslation()
  const activeTool = useSketchStore((s) => s.activeTool)
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  const [headStyle, setHeadStyle] = useState('default')
  const [strokeColor, setStrokeColor] = useState('#fff')
  const [thickness, setThickness] = useState(2)
  const [outlineStyle, setOutlineStyle] = useState('solid')
  const [arrowType, setArrowType] = useState('straight')
  const [curvature, setCurvature] = useState(20)

  // Bridge helpers: update React state + engine state + selected arrow
  const updateHead = useCallback((v) => {
    setHeadStyle(v)
    if (window.arrowToolSettings) window.arrowToolSettings.headStyle = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ arrowHeadStyle: v })
  }, [])

  const updateStroke = useCallback((v) => {
    setStrokeColor(v)
    if (window.arrowToolSettings) window.arrowToolSettings.strokeColor = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ stroke: v })
  }, [])

  const updateThickness = useCallback((v) => {
    setThickness(v)
    if (window.arrowToolSettings) window.arrowToolSettings.strokeWidth = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ strokeWidth: v })
  }, [])

  const updateOutline = useCallback((v) => {
    setOutlineStyle(v)
    if (window.arrowToolSettings) window.arrowToolSettings.outlineStyle = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ arrowOutlineStyle: v })
  }, [])

  const updateType = useCallback((v) => {
    setArrowType(v)
    if (window.arrowToolSettings) window.arrowToolSettings.arrowCurved = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ arrowCurved: v })
  }, [])

  const updateCurvature = useCallback((v) => {
    setCurvature(v)
    if (window.arrowToolSettings) window.arrowToolSettings.curveAmount = v
    if (window.updateSelectedArrowStyle) window.updateSelectedArrowStyle({ arrowCurveAmount: v })
  }, [])

  return (
    <ShapeSidebar visible={activeTool === TOOLS.ARROW || selectedShapeSidebar === 'arrow'}>
      {/* Head style */}
      <ToolbarButton icon="bxs-right-arrow" tooltip="Arrow head">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.head')}</p>
        <div className="flex items-center gap-1">
          {HEAD_STYLES.map((h) => (
            <button key={h.value} onClick={() => updateHead(h.value)}
              className={`w-10 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${headStyle === h.value ? 'bg-[#7667a8]/20 text-[#7667a8]' : 'text-text-secondary hover:bg-surface-hover'}`}
            >
              <SvgIcon svg={h.svg} />
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      <ToolbarButton tooltip={t('sidebar.strokeColor')}
        preview={<span className="w-4 h-4 rounded-md border border-border-light" style={{ backgroundColor: strokeColor }} />}
      >
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.stroke')}</p>
        <ColorGrid colors={STROKE_COLORS} selected={strokeColor} onSelect={updateStroke} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-edit-alt" tooltip={t('sidebar.strokeWidth')}>
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.width')}</p>
        <div className="flex items-center gap-1">
          {[1, 2, 4, 7].map((w) => (
            <button key={w} onClick={() => updateThickness(w)}
              className={`w-9 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${thickness === w ? 'bg-[#7667a8]/20 text-[#7667a8]' : 'text-text-secondary hover:bg-surface-hover'}`}
            >
              <div className="w-5 rounded-full bg-current" style={{ height: Math.max(1, w) }} />
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      <ToolbarButton icon="bxs-minus-circle" tooltip="Stroke style">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.style')}</p>
        <div className="flex items-center gap-1">
          {[{ v: 'solid', d: '' }, { v: 'dashed', d: '6 4' }, { v: 'dotted', d: '2 3' }].map((s) => (
            <button key={s.v} onClick={() => updateOutline(s.v)}
              className={`w-11 h-8 flex items-center justify-center rounded-lg transition-all duration-100 ${outlineStyle === s.v ? 'bg-[#7667a8]/20' : 'hover:bg-surface-hover'}`}
            >
              <svg width="28" height="4" viewBox="0 0 28 4"><line x1="0" y1="2" x2="28" y2="2" stroke="#fff" strokeWidth="2" strokeDasharray={s.d} strokeLinecap="round" /></svg>
            </button>
          ))}
        </div>
      </ToolbarButton>

      <Divider />

      {/* Arrow type */}
      <ToolbarButton icon="bxs-share-alt" tooltip="Arrow type">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-2">{t('sidebar.sectionHeader.type')}</p>
        <div className="flex flex-col gap-0.5">
          {[
            { v: 'straight', i: 'bxs-right-arrow-alt', l: 'Straight' },
            { v: 'curved', i: 'bxs-analyse', l: 'Curved' },
            { v: 'elbow', i: 'bxs-network-chart', l: 'Elbow' },
          ].map((a) => (
            <button key={a.v} onClick={() => updateType(a.v)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-100 ${arrowType === a.v ? 'bg-[#7667a8] text-white' : 'text-text-secondary hover:bg-surface-hover'}`}
            >
              <i className={`bx ${a.i} text-sm`} /> {a.l}
            </button>
          ))}
          {arrowType === 'curved' && (
            <>
              <div className="w-full h-px bg-border-light my-1" />
              <p className="text-[9px] text-text-dim uppercase tracking-wider mb-1">Curvature</p>
              <div className="flex items-center gap-1">
                {[{ v: 8, l: 'Lo' }, { v: 20, l: 'Md' }, { v: 40, l: 'Hi' }].map((c) => (
                  <button key={c.v} onClick={() => updateCurvature(c.v)}
                    className={`flex-1 py-1 rounded-md text-xs text-center transition-all duration-100 ${curvature === c.v ? 'bg-[#7667a8]/20 text-[#7667a8]' : 'text-text-secondary hover:bg-surface-hover'}`}
                  >{c.l}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </ToolbarButton>
      <Divider />
      <LayerControls />
    </ShapeSidebar>
  )
}
