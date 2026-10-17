"use client"

import { useEffect, useRef, useState } from 'react'
import useSketchStore, { TOOLS } from '../store/useSketchStore'
import useUIStore from '../store/useUIStore'

// Items are built lazily inside the component body so esbuild's lazy ESM
// wrapper can't evaluate them before the store module finishes init.
function getViewModeItems() {
  return [
    { tool: TOOLS.PAN, icon: 'bxs-hand', title: 'Pan (H)', key: 'H' },
  ]
}

function getMoreToolItems() {
  return [
    { tool: TOOLS.DRAW_SHAPE, icon: 'draw-shape', title: 'Draw to shape', key: 'D' },
    { tool: TOOLS.PAINT_BUCKET, icon: 'bxs-color-fill', title: 'Paint bucket', key: 'B' },
    { tool: TOOLS.FRAME, icon: 'bx-crop', title: 'Frame', key: 'F' },
    { tool: TOOLS.LASER, icon: 'bxs-magic-wand', title: 'Laser', key: 'K' },
    { tool: TOOLS.LASSO, icon: 'bx-shape-polygon', title: 'Lasso selection', key: 'S' },
    { tool: TOOLS.WEB_EMBED, icon: 'bx-globe', title: 'Web embed', key: 'W' },
  ]
}

function getToolItems() {
  return [
  { tool: TOOLS.PAN, icon: 'bxs-hand', title: 'Pan (H)', key: 'H' },
  { tool: TOOLS.SELECT, icon: 'bxs-pointer', title: 'Select (V)', key: 'V' },
  'spacer',
  { tool: TOOLS.RECTANGLE, icon: 'bx-square', title: 'Rectangle (R)', key: 'R' },
  { tool: TOOLS.CIRCLE, icon: 'bx-circle', title: 'Circle (O)', key: 'O' },
  { tool: TOOLS.LINE, icon: 'bx-minus', title: 'Line (L)', key: 'L' },
  { tool: TOOLS.ARROW, icon: 'bx-right-arrow-alt', title: 'Arrow (A)', rotate: true, key: 'A' },
  { tool: TOOLS.TEXT, icon: 'bx-text', title: 'Text (T)', key: 'T' },
  { tool: TOOLS.FREEHAND, icon: 'bx-pen', title: 'Freehand (P)', key: 'P' },
  { tool: TOOLS.IMAGE, icon: 'bx-image-alt', title: 'Image (9)', key: '9' },
  { tool: TOOLS.ICON, icon: 'bx-wink-smile', title: 'Icon (I)', key: 'I' },
  'spacer',
  { tool: TOOLS.ERASER, icon: 'bxs-eraser', title: 'Eraser (E)', key: 'E' },
  'more',
  // AI tool entry removed while the assistant is coming-soon.
  // Restore `{ tool: 'ai', icon: null, title: 'AI', isAI: true }` here
  // when the modal becomes a real feature again.
  ]
}

function ToolIcon({ item, className = 'h-5 w-5' }) {
  if (item.icon === 'draw-shape') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 16.5c2.2-5.8 4.5 3.5 7-2.5 1.1-2.7 2.2-3.8 3.4-3.9" />
        <path d="M15 4.5h6v6h-6z" />
        <path d="m12.5 8 2.5-.5" />
      </svg>
    )
  }
  return <i className={`bx ${item.icon} text-xl`} />
}

export default function Toolbar() {
  const activeTool = useSketchStore((s) => s.activeTool)
  const setActiveTool = useSketchStore((s) => s.setActiveTool)
  const viewMode = useSketchStore((s) => s.viewMode)
  const toolLock = useSketchStore((s) => s.toolLock)
  const toggleToolLock = useSketchStore((s) => s.toggleToolLock)
  const toggleAIModal = useUIStore((s) => s.toggleAIModal)
  const [moreOpen, setMoreOpen] = useState(false)
  const [lastMoreItem, setLastMoreItem] = useState(null)
  const moreRef = useRef(null)

  const items = viewMode ? getViewModeItems() : getToolItems()
  const moreItems = getMoreToolItems()
  const activeMoreItem = moreItems.find((item) => item.tool === activeTool)
  const moreActive = Boolean(activeMoreItem)
  const shownMoreItem = activeMoreItem || lastMoreItem

  useEffect(() => {
    if (!moreOpen) return undefined
    const close = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !moreRef.current?.contains(event.target))) setMoreOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [moreOpen])

  useEffect(() => {
    setMoreOpen(false)
  }, [activeTool, viewMode])

  return (
    <>
    <div data-canvas-toolbar className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-[46px] rounded-xl bg-surface z-[1000] flex flex-col items-center py-1.5 gap-0.5 font-[lixFont] max-h-[calc(100vh-120px)] overflow-visible`}>
      {/* Tool lock button at the top */}
      {!viewMode && (
        <>
          <button
            title="Tool Lock (Q)"
            onClick={toggleToolLock}
            className={`relative w-[33px] h-[30px] flex items-center justify-center rounded-lg transition-all duration-200 ${
              toolLock
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-dim hover:text-text-muted hover:bg-surface-hover'
            }`}
          >
            <i className={`bx ${toolLock ? 'bxs-lock-alt' : 'bx-lock-alt'} text-lg`} />
            <span className="absolute bottom-0.5 right-[-1px] text-[10px] leading-none opacity-50">Q</span>
          </button>
          <div className="w-6 h-px bg-border-light my-0.5" />
        </>
      )}

      {items.map((item, idx) => {
        if (item === 'spacer') {
          return (
            <div
              key={`spacer-${idx}`}
              className="w-6 h-px bg-border-light my-0.5"
            />
          )
        }

        if (item === 'more') {
          return (
            <div key="more" ref={moreRef} className="relative">
              <button
                type="button"
                title={shownMoreItem ? `${shownMoreItem.title} — More tools` : 'More tools'}
                aria-label="More tools"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
                className={`relative flex h-[31px] w-[33px] cursor-pointer items-center justify-center rounded-lg transition-all duration-200 ${moreOpen || moreActive ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'}`}
              >
                {shownMoreItem ? <ToolIcon item={shownMoreItem} className="h-[18px] w-[18px]" /> : <i className="bx bx-dots-horizontal-rounded text-xl" />}
              </button>
              {moreOpen && (
                <div className="absolute left-[calc(100%+10px)] top-1/2 z-[1100] w-[190px] -translate-y-1/2 rounded-xl border border-border-light bg-surface-card/95 p-1.5 shadow-xl shadow-black/25 backdrop-blur-lg">
                  <p className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-text-dim">More tools</p>
                  {moreItems.map((moreItem) => {
                    const selected = activeTool === moreItem.tool
                    return (
                      <button key={moreItem.tool} type="button" title={`${moreItem.title} (${moreItem.key})`} onClick={() => { setLastMoreItem(moreItem); setActiveTool(moreItem.tool); setMoreOpen(false) }} className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition ${selected ? 'bg-accent/20 text-accent' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'}`}>
                        <span className="flex h-5 w-5 items-center justify-center"><ToolIcon item={moreItem} className="h-[18px] w-[18px]" /></span>
                        <span className="flex-1">{moreItem.title}</span>
                        <span className="text-[10px] text-text-dim">{moreItem.key}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        const isActive = activeTool === item.tool

        if (item.isAI) {
          return (
            <button
              key="ai"
              title={item.title}
              onClick={toggleAIModal}
              className="w-[33px] h-[31px] flex items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-surface-hover transition-all duration-200"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
              </svg>
            </button>
          )
        }

        return (
          <button
            key={item.tool}
            title={item.title}
            onClick={() => setActiveTool(item.tool)}
            className={`relative w-[33px] h-[31px] flex items-center justify-center rounded-lg transition-all duration-200 ${
              isActive
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            <span style={item.rotate ? { transform: 'rotate(-45deg)' } : undefined}><ToolIcon item={item} /></span>
            {item.key && (
              <span className={`absolute bottom-0.5 right-[-1px] text-[10px] leading-none ${isActive ? 'opacity-60' : 'opacity-35'}`}>
                {item.key}
              </span>
            )}
          </button>
        )
      })}
    </div>
    {viewMode && (
      <div className="absolute top-16 left-2.5 w-[46px] z-[1000] flex justify-center font-[lixFont]">
        <span className="text-text-dim text-[9px] text-center leading-tight">
          View<br/>Mode<br/>
          <kbd className="text-[8px] text-text-muted">Esc</kbd>
        </span>
      </div>
    )}
    </>
  )
}
