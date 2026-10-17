"use client"

import { useState, useEffect } from 'react'
import { showToast } from '@/utils/toast'

export default function MultiSelectActions() {
  const [count, setCount] = useState(0)
  const [groupState, setGroupState] = useState('none') // 'none' | 'partial' | 'all'
  const [frameEligible, setFrameEligible] = useState(false)

  useEffect(() => {
    // Poll multi-selection state. Cheap — Set size + a single
    // groupId pass over selectedShapes.
    const interval = setInterval(() => {
      const ms = window.multiSelection
      const sel = ms?.selectedShapes
      const n = sel ? sel.size : 0
      setCount((prev) => (prev !== n ? n : prev))

      if (n < 2) {
        setGroupState('none')
        setFrameEligible(false)
        return
      }
      let withId = 0
      let groupIds = new Set()
      sel.forEach((s) => {
        if (s.groupId) {
          withId++
          groupIds.add(s.groupId)
        }
      })
      setFrameEligible(Array.from(sel).every((s) => s.shapeName !== 'frame' && !s.parentFrame))
      // "all" = every shape has a groupId AND they all share the same one
      if (withId === n && groupIds.size === 1) setGroupState('all')
      else if (withId > 0) setGroupState('partial')
      else setGroupState('none')
    }, 200)
    return () => clearInterval(interval)
  }, [])

  if (count < 2) return null

  const handleFrame = () => {
    if (window.frameSelectedShapes) {
      window.frameSelectedShapes()
      setCount(0)
    }
  }

  const handleGroup = () => {
    const ms = window.multiSelection
    const sel = ms?.selectedShapes
    if (!sel || sel.size < 2) return
    const newId = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    sel.forEach((s) => { s.groupId = newId })
    if (typeof ms.updateControls === 'function') ms.updateControls()
    showToast(`Grouped ${sel.size} shapes`, { tone: 'success' })
  }

  const handleUngroup = () => {
    const ms = window.multiSelection
    const sel = ms?.selectedShapes
    if (!sel || sel.size === 0) return
    const groupIds = new Set()
    sel.forEach((s) => { if (s.groupId) groupIds.add(s.groupId) })
    if (groupIds.size === 0 || !Array.isArray(window.shapes)) return
    let cleared = 0
    for (const s of window.shapes) {
      if (s.groupId && groupIds.has(s.groupId)) { s.groupId = null; cleared++ }
    }
    if (typeof ms.updateControls === 'function') ms.updateControls()
    showToast(`Ungrouped ${cleared} shapes`, { tone: 'success' })
  }

  const grouped = groupState === 'all'

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000] font-[lixFont]">
      <div className="flex items-center gap-2 bg-surface/90 backdrop-blur-lg border border-border-light rounded-xl px-3 py-1.5 shadow-lg">
        <span className="text-text-muted text-xs">
          {count} selected{grouped && <span className="ml-1 text-accent-blue">· grouped</span>}
        </span>
        <div className="w-px h-4 bg-border-light" />

        {/* Frame is only useful when shapes aren't already grouped — a
            grouped set is conceptually a "frameless frame" already. */}
        {!grouped && frameEligible && (
          <button
            onClick={handleFrame}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-accent-blue hover:bg-accent-blue/10 transition-all duration-150"
            title="Wrap selection in a frame"
          >
            <i className="bx bx-crop text-sm" />
            Frame it
          </button>
        )}

        {/* Group / Ungroup toggle. Group is shown when nothing in the
            selection is grouped yet; Ungroup once they're a single group. */}
        {grouped ? (
          <button
            onClick={handleUngroup}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-yellow-400 hover:bg-yellow-500/10 transition-all duration-150"
            title="Ungroup (Ctrl+Shift+G)"
          >
            <i className="bx bx-unlink text-sm" />
            Ungroup
          </button>
        ) : (
          <button
            onClick={handleGroup}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:bg-surface-hover transition-all duration-150"
            title="Group (Ctrl+G)"
          >
            <i className="bx bx-link text-sm" />
            Group
          </button>
        )}
      </div>
    </div>
  )
}
