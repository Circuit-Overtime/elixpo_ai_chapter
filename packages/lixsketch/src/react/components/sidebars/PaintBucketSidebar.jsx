"use client"

import { useCallback, useEffect, useState } from 'react'
import useSketchStore, { TOOLS } from '../../store/useSketchStore'
import ShapeSidebar, { Divider, ToolbarButton } from './ShapeSidebar'

const COLORS = ['#f0f0f0', '#ffcccb', '#90ee90', '#add8e6', '#FFE4B5', '#DDA0DD', '#A98DEB', '#2d2d2d']
const FILLS = [
  { value: 'solid', label: 'Solid' },
  { value: 'hachure', label: 'Hachure' },
  { value: 'cross-hatch', label: 'Cross-hatch' },
  { value: 'dots', label: 'Dots' },
  { value: 'none', label: 'Clear fill' },
]

export default function PaintBucketSidebar() {
  const activeTool = useSketchStore((state) => state.activeTool)
  const [fillColor, setFillColor] = useState('#A98DEB')
  const [fillStyle, setFillStyle] = useState('solid')
  const sync = useCallback((color, style) => {
    window.paintBucketSettings = window.paintBucketSettings || {}
    window.paintBucketSettings.fillColor = color
    window.paintBucketSettings.fillStyle = style
  }, [])
  useEffect(() => sync(fillColor, fillStyle), [fillColor, fillStyle, sync])

  return (
    <ShapeSidebar visible={activeTool === TOOLS.PAINT_BUCKET}>
      <ToolbarButton tooltip="Fill color" preview={<span className="h-4 w-4 rounded-md border border-border-light" style={{ backgroundColor: fillColor }} />}>
        <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Fill color</p>
        <div className="grid grid-cols-4 gap-1.5">
          {COLORS.map((color) => <button key={color} type="button" aria-label={`Use ${color}`} onClick={() => setFillColor(color)} className={`h-7 w-7 cursor-pointer rounded-md border-[1.5px] transition ${fillColor === color ? 'scale-110 border-accent' : 'border-border-light hover:border-text-dim'}`} style={{ backgroundColor: color }} />)}
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-text-muted">
          <input type="color" value={fillColor} onChange={(event) => setFillColor(event.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent" />
          Custom color
        </label>
      </ToolbarButton>
      <Divider />
      <ToolbarButton icon="bxs-brush" tooltip="Fill style">
        <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Fill style</p>
        <div className="flex flex-col gap-0.5">
          {FILLS.map((fill) => <button key={fill.value} type="button" onClick={() => setFillStyle(fill.value)} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${fillStyle === fill.value ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-hover'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{fill.label}</button>)}
        </div>
      </ToolbarButton>
      <div className="max-w-[185px] px-2 text-[10px] leading-4 text-text-dim">Fill rectangles, circles, frames, and closed freehand shapes. Lines and arrows are left unchanged.</div>
    </ShapeSidebar>
  )
}
