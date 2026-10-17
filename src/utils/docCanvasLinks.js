import useSketchStore from '@/store/useSketchStore'
import useUIStore from '@/store/useUIStore'

export const DOC_CANVAS_LINKS_EVENT = 'lix-doc-canvas-links-changed'
export const FOCUS_DOC_BLOCK_EVENT = 'lix-focus-doc-block'

function shapes() {
  return Array.isArray(window.shapes) ? window.shapes : []
}

export function getShapeElement(shape) {
  return shape?.group || shape?.element || null
}

export function getSelectedCanvasShape() {
  if (typeof window === 'undefined') return null
  const selected = window.multiSelection?.selectedShapes
  if (selected?.size === 1) return Array.from(selected)[0]
  if (selected?.size > 1) return null
  return window.currentShape || null
}

export function getShapeById(shapeId) {
  if (!shapeId || typeof window === 'undefined') return null
  return shapes().find((shape) => shape?.shapeID === shapeId) || null
}

export function getShapeDocBlockIds(shape) {
  if (!shape) return []
  const ids = Array.isArray(shape.docBlockIds)
    ? shape.docBlockIds
    : (shape.docBlockId ? [shape.docBlockId] : [])
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))]
}

function writeShapeDocBlockIds(shape, blockIds) {
  if (!shape) return
  const ids = [...new Set((blockIds || []).filter(Boolean))]
  shape.docBlockIds = ids
  delete shape.docBlockId
  const element = getShapeElement(shape)
  if (ids.length) element?.setAttribute('data-doc-block-ids', JSON.stringify(ids))
  else element?.removeAttribute('data-doc-block-ids')
  element?.removeAttribute('data-doc-block-id')
}

export function getShapesLinkedToBlock(blockId) {
  if (!blockId || typeof window === 'undefined') return []
  return shapes().filter((shape) => getShapeDocBlockIds(shape).includes(blockId))
}

// Kept for callers that only need the first destination.
export function getShapeLinkedToBlock(blockId) {
  return getShapesLinkedToBlock(blockId)[0] || null
}

export function getLinkedShapes() {
  if (typeof window === 'undefined') return []
  return shapes().filter((shape) => shape?.shapeID && getShapeDocBlockIds(shape).length)
}

export function emitDocCanvasLinksChanged() {
  if (typeof window === 'undefined') return
  useUIStore.getState().setSaveStatus('local')
  window.dispatchEvent(new CustomEvent(DOC_CANVAS_LINKS_EVENT))
}

export function linkShapeToBlock(shape, blockId) {
  if (!shape?.shapeID || !blockId) return false
  const ids = getShapeDocBlockIds(shape)
  if (ids.includes(blockId)) return false
  writeShapeDocBlockIds(shape, [...ids, blockId])
  emitDocCanvasLinksChanged()
  window.__onLocalSave?.()
  return true
}

export function unlinkBlock(blockId) {
  const linked = getShapesLinkedToBlock(blockId)
  if (!linked.length) return false
  for (const shape of linked) {
    writeShapeDocBlockIds(shape, getShapeDocBlockIds(shape).filter((id) => id !== blockId))
  }
  emitDocCanvasLinksChanged()
  window.__onLocalSave?.()
  return true
}

export function unlinkShapeFromBlock(shape, blockId) {
  const ids = getShapeDocBlockIds(shape)
  if (!ids.includes(blockId)) return false
  writeShapeDocBlockIds(shape, ids.filter((id) => id !== blockId))
  emitDocCanvasLinksChanged()
  window.__onLocalSave?.()
  return true
}

export function unlinkShape(shape) {
  if (!getShapeDocBlockIds(shape).length) return false
  writeShapeDocBlockIds(shape, [])
  emitDocCanvasLinksChanged()
  window.__onLocalSave?.()
  return true
}

export function pruneDocCanvasLinks(documentBlocks) {
  if (!Array.isArray(documentBlocks) || typeof window === 'undefined') return
  const blockIds = new Set()
  const collect = (blocks) => {
    for (const block of blocks || []) {
      if (block?.id) blockIds.add(block.id)
      if (block?.children?.length) collect(block.children)
    }
  }
  collect(documentBlocks)
  let changed = false
  for (const shape of shapes()) {
    const ids = getShapeDocBlockIds(shape)
    const validIds = ids.filter((id) => blockIds.has(id))
    if (validIds.length !== ids.length || shape.docBlockId) {
      writeShapeDocBlockIds(shape, validIds)
      changed = true
    }
  }
  if (changed) emitDocCanvasLinksChanged()
}

function selectShape(shape) {
  if (!shape) return
  const current = window.currentShape
  if (current && current !== shape && typeof current.removeSelection === 'function') {
    current.removeSelection()
  }
  window.multiSelection?.clearSelection?.()
  window.currentShape = shape
  if (typeof shape.addAnchors === 'function') shape.addAnchors()
  else if (typeof shape.createSelection === 'function') shape.createSelection()
  else if (typeof shape.selectShape === 'function') shape.selectShape()
  else if (typeof shape.selectFrame === 'function') shape.selectFrame()
  shape.isSelected = true
  shape.updateSidebar?.()
}

export function focusCanvasShape(shapeId) {
  if (typeof window === 'undefined') return false
  const shape = getShapeById(shapeId)
  if (!shape) return false
  useSketchStore.getState().setLayoutMode('split')

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const svg = window.svg || document.getElementById('freehand-canvas')
    const element = getShapeElement(shape)
    if (!svg || !element) return
    try {
      const bounds = element.getBBox()
      const viewBox = window.currentViewBox || svg.viewBox?.baseVal
      if (viewBox?.width && viewBox?.height) {
        const svgRect = svg.getBoundingClientRect()
        const paneRect = svg.parentElement?.getBoundingClientRect?.() || svgRect
        const visibleWidth = viewBox.width * Math.min(1, paneRect.width / Math.max(1, svgRect.width))
        const x = bounds.x + bounds.width / 2 - visibleWidth / 2
        const y = bounds.y + bounds.height / 2 - viewBox.height / 2
        window.currentViewBox = { x, y, width: viewBox.width, height: viewBox.height }
        svg.setAttribute('viewBox', `${x} ${y} ${viewBox.width} ${viewBox.height}`)
      }
      selectShape(shape)
    } catch {}
  }))
  return true
}

export function focusDocumentBlock(blockId) {
  if (!blockId || typeof window === 'undefined') return false
  window.__pendingDocBlockFocus = blockId
  useSketchStore.getState().setLayoutMode('split')
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent(FOCUS_DOC_BLOCK_EVENT, { detail: { blockId } }))
  }))
  return true
}
