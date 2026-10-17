'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DOC_CANVAS_LINKS_EVENT,
  focusDocumentBlock,
  getLinkedShapes,
  getShapeDocBlockIds,
  getShapeElement,
  unlinkShape,
} from '@/utils/docCanvasLinks'

export default function CanvasDocConnectors() {
  const hostRef = useRef(null)
  const frameRef = useRef(null)
  const bypassDeleteRef = useRef(false)
  const [connectors, setConnectors] = useState([])
  const [openShapeId, setOpenShapeId] = useState(null)
  const [deleteRequest, setDeleteRequest] = useState(null)

  const update = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const host = hostRef.current
      if (!host) return
      const hostRect = host.getBoundingClientRect()
      const next = []
      for (const shape of getLinkedShapes()) {
        const element = getShapeElement(shape)
        if (!element?.isConnected) continue
        const rect = element.getBoundingClientRect()
        if (rect.right < hostRect.left || rect.left > hostRect.right || rect.bottom < hostRect.top || rect.top > hostRect.bottom) continue
        next.push({
          shapeId: shape.shapeID,
          blockIds: getShapeDocBlockIds(shape),
          left: Math.min(hostRect.width - 24, Math.max(0, rect.right - hostRect.left - 10)),
          top: Math.min(hostRect.height - 24, Math.max(0, rect.top - hostRect.top - 10)),
        })
      }
      setConnectors(next)
    })
  }, [])

  const requestLinkedDeletion = useCallback((targets, onConfirm) => {
    const deletionTargets = new Set(targets || [])
    for (const shape of deletionTargets) {
      if (shape?.shapeName === 'frame' && shape._diagramType) {
        for (const child of shape.containedShapes || []) deletionTargets.add(child)
      }
    }
    const linkedTargets = Array.from(deletionTargets).filter((shape) => getShapeDocBlockIds(shape).length)
    if (!linkedTargets.length) return false
    setDeleteRequest({ targets: linkedTargets, onConfirm })
    return true
  }, [])

  useEffect(() => {
    const svg = document.getElementById('freehand-canvas')
    update()
    window.addEventListener(DOC_CANVAS_LINKS_EVENT, update)
    window.addEventListener('resize', update)
    const observer = svg && typeof MutationObserver !== 'undefined' ? new MutationObserver(update) : null
    observer?.observe(svg, { attributes: true, childList: true, subtree: true })
    const fallback = window.setInterval(update, 1500)
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.clearInterval(fallback)
      observer?.disconnect()
      window.removeEventListener(DOC_CANVAS_LINKS_EVENT, update)
      window.removeEventListener('resize', update)
    }
  }, [update])

  useEffect(() => {
    window.__requestLinkedShapeDeletion = requestLinkedDeletion
    const interceptDelete = (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (bypassDeleteRef.current) {
        bypassDeleteRef.current = false
        return
      }
      const target = event.target
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return
      const selected = window.multiSelection?.selectedShapes
      const targets = selected?.size ? Array.from(selected) : (window.currentShape ? [window.currentShape] : [])
      if (!targets.some((shape) => getShapeDocBlockIds(shape).length)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      requestLinkedDeletion(targets, () => {
        bypassDeleteRef.current = true
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: event.key,
          code: event.code,
          bubbles: true,
          cancelable: true,
        }))
      })
    }
    document.addEventListener('keydown', interceptDelete, true)
    return () => {
      delete window.__requestLinkedShapeDeletion
      document.removeEventListener('keydown', interceptDelete, true)
    }
  }, [requestLinkedDeletion])

  useEffect(() => {
    if (!deleteRequest && !openShapeId) return undefined
    const close = (event) => {
      if (event.key !== 'Escape') return
      setDeleteRequest(null)
      setOpenShapeId(null)
    }
    document.addEventListener('keydown', close, true)
    return () => document.removeEventListener('keydown', close, true)
  }, [deleteRequest, openShapeId])

  const confirmDeletion = () => {
    const request = deleteRequest
    if (!request) return
    for (const shape of request.targets) unlinkShape(shape)
    setDeleteRequest(null)
    request.onConfirm?.()
  }

  const linkCount = deleteRequest?.targets.reduce(
    (total, shape) => total + getShapeDocBlockIds(shape).length,
    0,
  ) || 0

  return (
    <>
      <div ref={hostRef} className="absolute inset-0 z-20 pointer-events-none overflow-hidden" aria-hidden={connectors.length === 0}>
        {connectors.map((connector) => (
          <div key={connector.shapeId} className="absolute pointer-events-auto" style={{ left: connector.left, top: connector.top }}>
            <button
              type="button"
              className="relative w-6 h-6 rounded-full border border-accent/50 bg-surface-card/95 text-accent shadow-lg shadow-black/25 backdrop-blur flex items-center justify-center cursor-pointer hover:bg-accent hover:text-white transition-colors"
              title={`Open ${connector.blockIds.length} linked document ${connector.blockIds.length === 1 ? 'block' : 'blocks'}`}
              aria-label="Open linked document blocks"
              onClick={(event) => {
                event.stopPropagation()
                if (connector.blockIds.length === 1) focusDocumentBlock(connector.blockIds[0])
                else setOpenShapeId((current) => current === connector.shapeId ? null : connector.shapeId)
              }}
            >
              <i className="bx bx-link text-sm" />
              {connector.blockIds.length > 1 && <span className="absolute -right-1.5 -top-1.5 min-w-3.5 h-3.5 px-0.5 rounded-full bg-accent text-white text-[9px] leading-3.5">{connector.blockIds.length}</span>}
            </button>
            {openShapeId === connector.shapeId && (
              <div className="absolute left-7 top-0 w-44 p-1.5 rounded-lg border border-border-light bg-surface-card shadow-xl pointer-events-auto">
                {connector.blockIds.map((blockId, index) => (
                  <button
                    key={blockId}
                    type="button"
                    className="w-full px-2 py-1.5 rounded text-left text-xs text-text-primary hover:bg-accent/15 cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenShapeId(null)
                      focusDocumentBlock(blockId)
                    }}
                  >
                    Document block {index + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {deleteRequest && createPortal(
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/55 p-4" role="presentation">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-card p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="linked-delete-title">
            <h2 id="linked-delete-title" className="text-lg text-text-primary">Delete connected canvas item?</h2>
            <p className="mt-2 text-sm text-text-secondary">This deletion will break {linkCount} document {linkCount === 1 ? 'connection' : 'connections'}. The linked document blocks will not be deleted.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="px-4 py-2 rounded-lg border border-border-light text-text-primary hover:bg-surface-hover cursor-pointer" onClick={() => setDeleteRequest(null)}>Cancel</button>
              <button type="button" className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 cursor-pointer" onClick={confirmDeletion}>Delete and break links</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
