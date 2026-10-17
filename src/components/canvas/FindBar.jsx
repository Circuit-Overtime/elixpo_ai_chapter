"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import useUIStore from '@/store/useUIStore'

export default function FindBar() {
  const open = useUIStore((s) => s.findBarOpen)
  const closeFindBar = useUIStore((s) => s.closeFindBar)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)
  const highlightRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActiveIndex(-1)
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      // Clean up highlight when closing
      removeHighlight()
    }
  }, [open])

  const removeHighlight = useCallback(() => {
    if (highlightRef.current && highlightRef.current.parentNode) {
      highlightRef.current.parentNode.removeChild(highlightRef.current)
      highlightRef.current = null
    }
  }, [])

  const highlightShape = useCallback((result) => {
    removeHighlight()
    if (!result || !window.svg) return

    const shape = result.shape
    const x = shape.x || 0
    const y = shape.y || 0
    const w = shape.width || 100
    const h = shape.height || 30

    // Create highlight rect
    const ns = 'http://www.w3.org/2000/svg'
    const rect = document.createElementNS(ns, 'rect')
    rect.setAttribute('x', x - 4)
    rect.setAttribute('y', y - 4)
    rect.setAttribute('width', w + 8)
    rect.setAttribute('height', h + 8)
    rect.setAttribute('fill', 'rgba(91, 87, 209, 0.15)')
    rect.setAttribute('stroke', '#7667a8')
    rect.setAttribute('stroke-width', '2')
    rect.setAttribute('stroke-dasharray', '4,2')
    rect.setAttribute('rx', '4')
    rect.setAttribute('pointer-events', 'none')
    rect.classList.add('find-highlight')
    window.svg.appendChild(rect)
    highlightRef.current = rect

    // Pan to the shape
    const svgEl = window.svg
    const vb = svgEl.viewBox.baseVal
    const centerX = x + w / 2
    const centerY = y + h / 2
    const newX = centerX - vb.width / 2
    const newY = centerY - vb.height / 2
    svgEl.setAttribute('viewBox', `${newX} ${newY} ${vb.width} ${vb.height}`)
    if (window.currentViewBox) {
      window.currentViewBox.x = newX
      window.currentViewBox.y = newY
    }
  }, [removeHighlight])

  const doSearch = useCallback((q) => {
    const finder = window.__sceneSerializer?.findText
    if (!finder || !q.trim()) {
      setResults([])
      setActiveIndex(-1)
      removeHighlight()
      return
    }
    const found = finder(q)
    setResults(found)
    if (found.length > 0) {
      setActiveIndex(0)
      highlightShape(found[0])
    } else {
      setActiveIndex(-1)
      removeHighlight()
    }
  }, [highlightShape, removeHighlight])

  const goToResult = useCallback((idx) => {
    if (idx < 0 || idx >= results.length) return
    setActiveIndex(idx)
    highlightShape(results[idx])
  }, [results, highlightShape])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeFindBar()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (results.length === 0) {
        doSearch(query)
      } else {
        // Go to next result
        const next = (activeIndex + 1) % results.length
        goToResult(next)
      }
      return
    }
  }

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    doSearch(q)
  }

  if (!open) return null

  return (
    <div className="fixed top-14 right-4 z-[1000] font-[lixFont]">
      <div className="flex items-center gap-2 bg-surface-card/95 backdrop-blur-lg border border-border-light rounded-xl px-3 py-2 shadow-xl min-w-[300px]">
        <i className="bx bx-search text-text-muted text-sm" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Find text on canvas..."
          className="flex-1 bg-transparent text-text-primary text-xs outline-none placeholder:text-text-dim font-[lixFont]"
        />

        {results.length > 0 && (
          <span className="text-text-dim text-xs whitespace-nowrap">
            {activeIndex + 1}/{results.length}
          </span>
        )}
        {query && results.length === 0 && (
          <span className="text-red-400/70 text-xs whitespace-nowrap">
            No results
          </span>
        )}

        {results.length > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => goToResult((activeIndex - 1 + results.length) % results.length)}
              className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <i className="bx bx-chevron-up text-sm" />
            </button>
            <button
              onClick={() => goToResult((activeIndex + 1) % results.length)}
              className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <i className="bx bx-chevron-down text-sm" />
            </button>
          </div>
        )}

        <button
          onClick={closeFindBar}
          className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <i className="bx bx-x text-sm" />
        </button>
      </div>
    </div>
  )
}
