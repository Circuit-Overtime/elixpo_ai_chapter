"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import useSketchStore from '../../store/useSketchStore'
import useUIStore from '../../store/useUIStore'
import { showToast } from '../../utils/toast'

// ── Helpers ──────────────────────────────────────────────────

function getCleanSVG() {
  const svgEl = window.svg
  if (!svgEl) return null
  const clone = svgEl.cloneNode(true)
  clone.querySelectorAll(
    '[data-selection], .selection-handle, .resize-handle, .rotation-handle, .anchor, .rotate-anchor, .resize-anchor, .rotation-anchor, .selection-outline'
  ).forEach((el) => el.remove())
  return clone
}

function renderToCanvas(clone, scale, bgColor) {
  return new Promise((resolve) => {
    const svgData = new XMLSerializer().serializeToString(clone)
    const vb = window.svg.viewBox.baseVal
    const canvas = document.createElement('canvas')
    canvas.width = vb.width * scale
    canvas.height = vb.height * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    const img = new Image()
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      if (bgColor) {
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, vb.width, vb.height)
      }
      ctx.drawImage(img, 0, 0, vb.width, vb.height)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

function getShapeAtPoint(x, y) {
  const shapes = window.shapes
  if (!shapes) return null
  // Walk backwards (topmost first)
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i]
    const el = shape.group || shape.element
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return shape
    }
  }
  return null
}

// ── Menu item components ─────────────────────────────────────

function MenuItem({ label, shortcut, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors duration-100 ${
        disabled
          ? 'text-text-dim cursor-default'
          : danger
            ? 'text-red-400 hover:bg-red-500/15 cursor-pointer'
            : 'text-text-secondary hover:bg-surface-hover cursor-pointer'
      }`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-text-dim text-[10px] ml-6">{shortcut}</span>}
    </button>
  )
}

function CheckMenuItem({ label, shortcut, checked, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors duration-100"
    >
      <span className="flex items-center gap-2">
        {checked && <i className="bx bx-check text-sm text-accent-blue -ml-0.5" />}
        {!checked && <span className="w-[14px]" />}
        {label}
      </span>
      {shortcut && <span className="text-text-dim text-[10px] ml-6">{shortcut}</span>}
    </button>
  )
}

function Separator() {
  return <hr className="border-border-light my-1" />
}

// ── Main component ───────────────────────────────────────────

export default function ContextMenu() {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [targetShape, setTargetShape] = useState(null)
  const menuRef = useRef(null)

  const gridEnabled = useSketchStore((s) => s.gridEnabled)
  const snapToObjects = useSketchStore((s) => s.snapToObjects)
  const zenMode = useSketchStore((s) => s.zenMode)
  const viewMode = useSketchStore((s) => s.viewMode)

  const close = useCallback(() => {
    setVisible(false)
    setTargetShape(null)
  }, [])

  // Context menu handler
  useEffect(() => {
    const handleContextMenu = (e) => {
      const svg = document.getElementById('freehand-canvas')
      if (!svg) return

      // Only handle right-clicks on or within the SVG canvas
      if (!svg.contains(e.target) && e.target !== svg) return

      e.preventDefault()
      const shape = getShapeAtPoint(e.clientX, e.clientY)

      // Also check if there's a currentShape selected
      const current = window.currentShape || null

      setTargetShape(shape || current)
      setPosition({ x: e.clientX, y: e.clientY })
      setVisible(true)
    }

    const handleClick = () => close()
    const handleKeyDown = (e) => { if (e.key === 'Escape') close() }

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [close])

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!visible || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let { x, y } = position
    if (x + rect.width > vw - 8) x = vw - rect.width - 8
    if (y + rect.height > vh - 8) y = vh - rect.height - 8
    if (x !== position.x || y !== position.y) setPosition({ x, y })
  }, [visible, position])

  if (!visible) return null

  // ── Action handlers ────────────────────────────────────────

  const handlePaste = () => {
    if (typeof window.pasteClipboard === 'function') window.pasteClipboard()
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }))
    close()
  }

  const handleCopy = () => {
    if (typeof window.copySelected === 'function') window.copySelected()
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
    close()
  }

  const handleCut = () => {
    handleCopy()
    handleDeleteShape()
  }

  const handleSelectAll = () => {
    useSketchStore.getState().setActiveTool('select')
    if (window.multiSelection && window.shapes) {
      window.multiSelection.clearSelection()
      window.shapes.forEach((s) => window.multiSelection.addShape(s))
    }
    close()
  }

  const handleCopyPNG = async () => {
    const clone = getCleanSVG()
    if (!clone) { close(); return }
    const canvas = await renderToCanvas(clone, 2, '#121212')
    if (!canvas) { close(); return }
    canvas.toBlob((blob) => {
      if (blob) navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {})
    }, 'image/png')
    close()
  }

  const handleCopySVG = () => {
    const clone = getCleanSVG()
    if (!clone) { close(); return }
    const svgData = new XMLSerializer().serializeToString(clone)
    navigator.clipboard.writeText(svgData).catch(() => {})
    close()
  }

  const handleToggleGrid = () => {
    useSketchStore.getState().toggleGrid()
    close()
  }

  const handleToggleSnap = () => {
    useSketchStore.getState().toggleSnapToObjects()
    close()
  }

  const handleZenMode = () => {
    useSketchStore.getState().toggleZenMode()
    close()
  }

  const handleViewMode = () => {
    useSketchStore.getState().toggleViewMode()
    close()
  }

  const handleDeleteShape = () => {
    // Multi-selection delete
    if (window.multiSelection?.selectedShapes?.size > 0) {
      if (typeof window.deleteSelectedShapes === 'function') window.deleteSelectedShapes()
      close()
      return
    }
    const shape = targetShape || window.currentShape
    if (!shape) { close(); return }
    const shapes = window.shapes

    // Issue #24 bug #7: frame → orphan children + snapshot for undo
    // (mirrors deleteSelectedShapes / EngineShortcuts).
    const isFrame = shape.shapeName === 'frame'
    const isDiagramFrame = isFrame && !!shape._diagramType
    let childSnapshot = null
    if (isFrame && !isDiagramFrame) {
      childSnapshot = [...(shape.containedShapes || [])]
      for (const child of childSnapshot) {
        if (!child || child === shape) continue
        const el = child.group || child.element
        if (el) {
          if (shape.clipGroup && el.parentNode === shape.clipGroup) shape.clipGroup.removeChild(el)
          if (window.svg && el.parentNode !== window.svg) window.svg.appendChild(el)
        }
        child.parentFrame = null
        delete child.isBeingMovedByFrame
      }
      shape.containedShapes = []
    }

    if (shapes) {
      const idx = shapes.indexOf(shape)
      if (idx !== -1) shapes.splice(idx, 1)
    }
    if (typeof window.cleanupAttachments === 'function') window.cleanupAttachments(shape)
    if (shape.parentFrame && typeof shape.parentFrame.removeShapeFromFrame === 'function') {
      shape.parentFrame.removeShapeFromFrame(shape)
    }

    if (isFrame && !isDiagramFrame) {
      if (shape.group && shape.group.parentNode) shape.group.parentNode.removeChild(shape.group)
      if (shape.clipGroup && shape.clipGroup.parentNode) shape.clipGroup.parentNode.removeChild(shape.clipGroup)
      if (shape.clipPath && shape.clipPath.parentNode) shape.clipPath.parentNode.removeChild(shape.clipPath)
    } else {
      const el = shape.group || shape.element
      if (el && el.parentNode) el.parentNode.removeChild(el)
    }

    if (typeof window.pushDeleteAction === 'function') {
      if (childSnapshot) window.pushDeleteAction(shape, { childSnapshot })
      else window.pushDeleteAction(shape)
    }
    window.currentShape = null
    if (typeof window.disableAllSideBars === 'function') window.disableAllSideBars()
    close()
  }

  const handleDuplicate = () => {
    // Copy then paste
    if (typeof window.copySelected === 'function') window.copySelected()
    setTimeout(() => {
      if (typeof window.pasteClipboard === 'function') window.pasteClipboard()
    }, 50)
    close()
  }

  // Layer order
  const handleLayerAction = (action) => {
    const shape = targetShape || window.currentShape
    if (!shape || !window.__layerOrder) { close(); return }
    window.__layerOrder[action](shape)
    close()
  }

  // Flip (transform via scale)
  const handleFlip = (axis) => {
    const shape = targetShape || window.currentShape
    if (!shape) { close(); return }
    const el = shape.group || shape.element
    if (!el) { close(); return }
    const current = el.getAttribute('transform') || ''
    const bbox = el.getBBox()
    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2
    const scaleStr = axis === 'h'
      ? `translate(${cx * 2}, 0) scale(-1, 1)`
      : `translate(0, ${cy * 2}) scale(1, -1)`
    el.setAttribute('transform', current + ' ' + scaleStr)
    close()
  }

  // Wrap selection in frame
  const handleWrapInFrame = () => {
    // Simulate the frame wrap if engine supports it
    close()
  }

  // ── Group / ungroup helpers ─────────────────────────────────
  // Mirror the Ctrl+G / Ctrl+Shift+G behavior so the right-click menu
  // is a discoverable alternative.
  const handleGroup = () => {
    const ms = window.multiSelection
    const sel = ms?.selectedShapes
    const targets = sel && sel.size > 1
      ? Array.from(sel)
      : (window.currentShape ? [window.currentShape] : [])
    if (targets.length > 1) {
      const newId = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      for (const s of targets) s.groupId = newId
      if (typeof ms?.updateControls === 'function') ms.updateControls()
      showToast(`Grouped ${targets.length} shapes`, { tone: 'success' })
    }
    close()
  }

  const handleUngroup = () => {
    const ms = window.multiSelection
    const sel = ms?.selectedShapes
    const targets = sel && sel.size > 0
      ? Array.from(sel)
      : (window.currentShape ? [window.currentShape] : [])
    const groupIds = new Set(targets.map(s => s.groupId).filter(Boolean))
    if (groupIds.size > 0 && Array.isArray(window.shapes)) {
      let cleared = 0
      for (const s of window.shapes) {
        if (s.groupId && groupIds.has(s.groupId)) { s.groupId = null; cleared++ }
      }
      if (typeof ms?.updateControls === 'function') ms.updateControls()
      showToast(`Ungrouped ${cleared} shapes`, { tone: 'success' })
    }
    close()
  }

  // Compute selection state for the menu rendering below.
  const selectionShapes = (() => {
    const sel = window.multiSelection?.selectedShapes
    if (sel && sel.size > 0) return Array.from(sel)
    if (targetShape) return [targetShape]
    return []
  })()
  const canGroup = selectionShapes.length > 1
  const groupIdsInSelection = new Set(selectionShapes.map(s => s.groupId).filter(Boolean))
  const canUngroup = groupIdsInSelection.size > 0
  const fullyGrouped = selectionShapes.length > 1 &&
    selectionShapes.every(s => s.groupId) &&
    groupIdsInSelection.size === 1

  const handleCanvasProperties = () => {
    // Toggle shape sidebar / properties via Alt+/
    close()
  }

  // ── Render ─────────────────────────────────────────────────

  const isShape = !!targetShape

  return (
    <div
      ref={menuRef}
      className="fixed z-9999 min-w-[220px] py-1.5 bg-surface/90 backdrop-blur-xl rounded-xl border border-border-light shadow-2xl font-[lixFont] select-none"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {isShape ? (
        /* ── Shape context menu ── */
        <>
          <MenuItem label="Cut" shortcut="Ctrl+X" onClick={handleCut} />
          <MenuItem label="Copy" shortcut="Ctrl+C" onClick={handleCopy} />
          <MenuItem label="Paste" shortcut="Ctrl+V" onClick={handlePaste} />

          <Separator />
          {/* Frame wrap doesn't make sense when the selection is already
              grouped — the group itself is the implicit container. */}
          {!fullyGrouped && (
            <MenuItem label="Wrap selection in frame" onClick={handleWrapInFrame} />
          )}
          {canGroup && !fullyGrouped && (
            <MenuItem label="Group" shortcut="Ctrl+G" onClick={handleGroup} />
          )}
          {canUngroup && (
            <MenuItem label="Ungroup" shortcut="Ctrl+Shift+G" onClick={handleUngroup} />
          )}

          <Separator />
          <MenuItem label="Copy to clipboard as PNG" shortcut="Shift+Alt+C" onClick={handleCopyPNG} />
          <MenuItem label="Copy to clipboard as SVG" onClick={handleCopySVG} />

          <Separator />
          <MenuItem label="Send backward" shortcut="Ctrl+[" onClick={() => handleLayerAction('sendBackward')} />
          <MenuItem label="Bring forward" shortcut="Ctrl+]" onClick={() => handleLayerAction('bringForward')} />
          <MenuItem label="Send to back" shortcut="Ctrl+Shift+[" onClick={() => handleLayerAction('sendToBack')} />
          <MenuItem label="Bring to front" shortcut="Ctrl+Shift+]" onClick={() => handleLayerAction('bringToFront')} />

          <Separator />
          <MenuItem label="Flip horizontal" shortcut="Shift+H" onClick={() => handleFlip('h')} />
          <MenuItem label="Flip vertical" shortcut="Shift+V" onClick={() => handleFlip('v')} />

          <Separator />
          <MenuItem label="Duplicate" shortcut="Ctrl+D" onClick={handleDuplicate} />
          <MenuItem label="Delete" danger onClick={handleDeleteShape} />
        </>
      ) : (
        /* ── Canvas context menu ── */
        <>
          <MenuItem label="Paste" shortcut="Ctrl+V" onClick={handlePaste} />
          <MenuItem label="Copy to clipboard as PNG" shortcut="Shift+Alt+C" onClick={handleCopyPNG} />
          <MenuItem label="Copy to clipboard as SVG" onClick={handleCopySVG} />

          <Separator />
          <MenuItem label="Select all" shortcut="Ctrl+A" onClick={handleSelectAll} />

          <Separator />
          <CheckMenuItem label="Toggle grid" shortcut="Ctrl+'" checked={gridEnabled} onClick={handleToggleGrid} />
          <CheckMenuItem label="Snap to objects" shortcut="Alt+S" checked={snapToObjects} onClick={handleToggleSnap} />

          <Separator />
          <MenuItem label="Find on canvas" shortcut="Ctrl+F" onClick={() => { useUIStore.getState().toggleFindBar(); close() }} />
          <MenuItem label="Zen mode" shortcut="Alt+Z" onClick={handleZenMode} />
          <MenuItem label="View mode" shortcut="Alt+R" onClick={handleViewMode} />

          <Separator />
          <MenuItem label="Reset canvas" danger onClick={() => {
            const serializer = window.__sceneSerializer
            if (serializer?.resetCanvas) serializer.resetCanvas()
            close()
          }} />
        </>
      )}
    </div>
  )
}
