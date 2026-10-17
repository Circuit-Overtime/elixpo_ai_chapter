"use client"

import useSketchStore, { TOOLS } from '@/store/useSketchStore'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from '@/hooks/useTranslation'

const iconResultCache = new Map()

const CATEGORIES = [
  { value: null, label: 'All', icon: 'bxs-grid-alt' },
  { value: 'tech', label: 'Tech', icon: 'bxs-chip' },
  { value: 'devops', label: 'DevOps', icon: 'bxs-server' },
  { value: 'design', label: 'Design', icon: 'bxs-palette' },
  { value: 'social media', label: 'Social', icon: 'bxs-share-alt' },
  { value: 'navigation', label: 'Nav', icon: 'bxs-navigation' },
  { value: 'business', label: 'Business', icon: 'bxs-briefcase' },
  { value: 'media', label: 'Media', icon: 'bxs-videos' },
]

// Normalize an SVG string so it renders fully within a fixed box.
// Ensures the inner <svg> has width/height="100%" and a viewBox.
function normalizeSvg(raw) {
  if (!raw) return raw
  // Parse to a temp element so we can inspect attributes
  const tmp = document.createElement('div')
  tmp.innerHTML = raw
  const svgEl = tmp.querySelector('svg')
  if (!svgEl) return raw

  // Ensure viewBox exists — derive from width/height if missing
  if (!svgEl.getAttribute('viewBox')) {
    const w = parseFloat(svgEl.getAttribute('width')) || 24
    const h = parseFloat(svgEl.getAttribute('height')) || 24
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  // Force the SVG to fill its container
  svgEl.setAttribute('width', '100%')
  svgEl.setAttribute('height', '100%')
  return tmp.innerHTML
}

function IconCell({ icon, onClick }) {
  const name = icon.filename?.replace('.svg', '').replace(/_/g, ' ') || ''
  const normalizedSvg = typeof document !== 'undefined' && icon.svg ? normalizeSvg(icon.svg) : icon.svg
  return (
    <button
      onClick={onClick}
      title={name}
      style={{ width: '44px', height: '44px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
      className="hover:bg-surface-hover transition-colors duration-100"
    >
      {normalizedSvg ? (
        <div
          style={{ width: '24px', height: '24px', overflow: 'visible', flexShrink: 0, pointerEvents: 'none', filter: 'var(--lix-icon-filter, brightness(0) invert(1))' }}
          dangerouslySetInnerHTML={{ __html: normalizedSvg }}
        />
      ) : (
        <img
          src={`/icons/${encodeURIComponent(icon.filename)}`}
          alt=""
          style={{ width: '24px', height: '24px', pointerEvents: 'none', filter: 'var(--lix-icon-filter, brightness(0) invert(1))' }}
          loading="lazy"
        />
      )}
    </button>
  )
}

export default function IconSidebar() {
  const { t } = useTranslation()
  const activeTool = useSketchStore((s) => s.activeTool)
  const setActiveTool = useSketchStore((s) => s.setActiveTool)
  const visible = activeTool === TOOLS.ICON
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(null)
  const [icons, setIcons] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const searchInputRef = useRef(null)
  const requestSequenceRef = useRef(0)

  useEffect(() => {
    if (!visible) return
    // Focusing a transformed, previously off-screen input can make the
    // browser scroll its nearest canvas pane horizontally. Keep focus for
    // keyboard search without allowing it to move the viewport.
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [visible])

  // Close on Escape
  useEffect(() => {
    if (!visible) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setActiveTool(TOOLS.SELECT)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [visible, setActiveTool])

  // Close when clicking on the canvas (outside the sidebar)
  useEffect(() => {
    if (!visible) return
    const svgEl = document.getElementById('freehand-canvas')
    if (!svgEl) return
    const handleCanvasClick = () => setActiveTool(TOOLS.SELECT)
    svgEl.addEventListener('mousedown', handleCanvasClick)
    return () => svgEl.removeEventListener('mousedown', handleCanvasClick)
  }, [visible, setActiveTool])

  const fetchIcons = useCallback(async (searchQuery, cat) => {
    const requestSequence = ++requestSequenceRef.current
    const params = new URLSearchParams()
    if (searchQuery) params.set('q', searchQuery)
    if (cat) params.set('category', cat)
    params.set('inline', '1')
    const cacheKey = params.toString()

    // Return cached results instantly if available
    if (iconResultCache.has(cacheKey)) {
      setIcons(iconResultCache.get(cacheKey))
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/icons/search?${cacheKey}`)
      if (res.ok) {
        const data = await res.json()
        const results = data.results || []
        iconResultCache.set(cacheKey, results)
        if (requestSequence === requestSequenceRef.current) setIcons(results)
      }
    } catch (err) {
      console.error('Icon fetch failed:', err)
    }
    if (requestSequence === requestSequenceRef.current) setLoading(false)
  }, [])

  // Fetch icons when visibility, query, or category changes (debounced for query typing)
  useEffect(() => {
    if (!visible) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchIcons(query, category)
    }, query ? 80 : 0)
    return () => clearTimeout(debounceRef.current)
  }, [query, visible, category, fetchIcons])

  const handleIconClick = useCallback((icon) => {
    if (typeof window === 'undefined') return
    const place = (svgContent) => {
      if (window.prepareIconPlacement) {
        window.prepareIconPlacement(svgContent)
      } else {
        window.iconToPlace = svgContent
      }
    }
    if (icon.svg) {
      place(icon.svg)
    } else {
      fetch(`/icons/${encodeURIComponent(icon.filename)}`)
        .then((r) => r.text())
        .then(place)
        .catch(() => {})
    }
  }, [])

  // Do not keep a translated panel outside the canvas bounds. Even though it
  // is absolutely positioned, browsers may include transformed descendants
  // in scroll/focus calculations, producing a one-frame canvas jump.
  if (!visible) return null

  // Issue #38 follow-up: every hardcoded `bg-[#18181c]` / `text-white/…`
  // / `bg-white/…` swapped for the engine theme tokens so the icon
  // picker follows the canvas theme (light by default, dark on toggle).
  return (
    <div
      className="absolute top-[60px] right-2 bottom-[112px] w-[300px] bg-surface-card border border-border-light rounded-2xl z-[999] font-[lixFont] flex flex-col"
    >
      {/* Header */}
      <div className="px-3.5 pt-3.5 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-text-primary text-sm font-medium">Icons</h3>
          <button
            onClick={() => setActiveTool(TOOLS.SELECT)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-text-dim hover:text-text-primary hover:bg-surface-hover transition-colors duration-100 cursor-pointer"
            title="Close (Esc)"
          >
            <i className="bx bx-x text-lg" />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-surface-hover border border-border-light rounded-lg px-2.5 py-2">
          <i className="bx bxs-search text-text-dim text-sm" />
          <input
            ref={searchInputRef}
            id="iconSearchInput"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons..."
            className="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-dim"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-text-dim hover:text-text-secondary cursor-pointer"
              title="Clear search"
              aria-label="Clear icon search"
            >
              <i className="bx bxs-x-circle text-sm" />
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      <div
        className="grid grid-cols-4 gap-1.5 px-3.5 pb-3 shrink-0"
        role="group"
        aria-label="Filter icons by category"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value || 'all'}
            onClick={() => setCategory(cat.value)}
            aria-pressed={category === cat.value}
            title={`Show ${cat.label.toLowerCase()} icons`}
            className={`h-8 min-w-0 flex items-center justify-center gap-1 rounded-lg border px-1.5 text-[10.5px] whitespace-nowrap transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50 ${
              category === cat.value
                ? 'border-accent-blue/50 bg-accent-blue/20 text-accent-blue shadow-sm'
                : 'border-border-light bg-surface/40 text-text-muted hover:border-accent-blue/30 hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <i className={`bx ${cat.icon} shrink-0 text-xs`} />
            <span className="min-w-0 truncate">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-border-light mx-3.5 shrink-0" />

      {/* Icon grid — scrollable */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-2.5" id="iconsContainer">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-text-dim text-sm">
            <i className="bx bxs-hourglass bx-spin text-lg mr-2" />
            Loading...
          </div>
        ) : icons.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-text-dim text-sm">
            No icons found
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '2px' }}>
            {icons.map((icon, i) => (
              <IconCell
                key={icon.filename || i}
                icon={icon}
                onClick={() => handleIconClick(icon)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
