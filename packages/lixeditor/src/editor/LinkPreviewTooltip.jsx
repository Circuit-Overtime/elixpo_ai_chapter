'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Client-side cache to avoid refetching the same URL
const previewCache = new Map();

let linkPreviewEndpoint = '/api/link-preview';
export function setLinkPreviewEndpoint(endpoint) { linkPreviewEndpoint = endpoint; }

async function fetchPreview(url) {
  if (previewCache.has(url)) return previewCache.get(url);
  try {
    const res = await fetch(`${linkPreviewEndpoint}?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    previewCache.set(url, data);
    return data;
  } catch {
    const fallback = { title: new URL(url).hostname, description: '', image: '', favicon: '', domain: new URL(url).hostname };
    previewCache.set(url, fallback);
    return fallback;
  }
}

export default function LinkPreviewTooltip({ anchorEl, url, onClose, onEdit }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const tooltipRef = useRef(null);
  const hoverRef = useRef(false); // true if mouse is over link OR tooltip
  const hideTimerRef = useRef(null);

  useEffect(() => {
    if (!url) return;
    setLoading(true);
    fetchPreview(url).then(d => {
      setData(d);
      setLoading(false);
    });
  }, [url]);

  // Position computed once on mount
  const posRef = useRef(null);
  if (!posRef.current && anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 300;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));

    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow >= tooltipHeight || spaceBelow >= rect.top) {
      // Show below
      posRef.current = { top: rect.bottom + 4, left };
    } else {
      // Show above — use bottom anchoring
      posRef.current = { bottom: window.innerHeight - rect.top + 4, left, useBottom: true };
    }
  }

  // Unified hover tracking: mouse over link OR tooltip = alive
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!hoverRef.current) onClose();
    }, 200);
  }, [onClose]);

  // Track mouse on the anchor link
  useEffect(() => {
    if (!anchorEl) return;
    const onEnter = () => { hoverRef.current = true; clearTimeout(hideTimerRef.current); };
    const onLeave = () => { hoverRef.current = false; scheduleHide(); };
    anchorEl.addEventListener('mouseenter', onEnter);
    anchorEl.addEventListener('mouseleave', onLeave);
    return () => {
      anchorEl.removeEventListener('mouseenter', onEnter);
      anchorEl.removeEventListener('mouseleave', onLeave);
    };
  }, [anchorEl, scheduleHide]);

  const onTooltipEnter = useCallback(() => {
    hoverRef.current = true;
    clearTimeout(hideTimerRef.current);
  }, []);

  const onTooltipLeave = useCallback(() => {
    hoverRef.current = false;
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    return () => clearTimeout(hideTimerRef.current);
  }, []);

  if (!url || !posRef.current) return null;

  const style = posRef.current.useBottom
    ? { bottom: posRef.current.bottom, left: posRef.current.left }
    : { top: posRef.current.top, left: posRef.current.left };

  return (
    <div
      ref={tooltipRef}
      className="link-preview-tooltip"
      style={style}
      onMouseEnter={onTooltipEnter}
      onMouseLeave={onTooltipLeave}
    >
      {loading ? (
        <div className="link-preview-loading">
          <div className="link-preview-skeleton" style={{ width: '60%', height: 12 }} />
          <div className="link-preview-skeleton" style={{ width: '90%', height: 10, marginTop: 8 }} />
          <div className="link-preview-skeleton" style={{ width: '40%', height: 10, marginTop: 4 }} />
        </div>
      ) : data ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="link-preview-card">
          {data.image && (
            <div className="link-preview-image">
              <img src={data.image} alt="" onError={e => { e.target.style.display = 'none'; }} />
            </div>
          )}
          <div className="link-preview-body">
            <div className="link-preview-title">{data.title}</div>
            {data.description && (
              <div className="link-preview-desc">{data.description.length > 120 ? data.description.slice(0, 120) + '...' : data.description}</div>
            )}
            <div className="link-preview-domain">
              {data.favicon && <img src={data.favicon} alt="" className="link-preview-favicon" onError={e => { e.target.style.display = 'none'; }} />}
              <span>{data.domain}</span>
            </div>
          </div>
        </a>
      ) : null}
      {onEdit && (
        <div className="link-preview-footer">
          <button
            type="button"
            className="link-preview-edit-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Edit link
          </button>
        </div>
      )}
    </div>
  );
}

// Hook to manage link preview state for any container
export function useLinkPreview() {
  const [preview, setPreview] = useState(null);
  const showTimerRef = useRef(null);

  const show = useCallback((anchorEl, url) => {
    clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => {
      setPreview({ anchorEl, url });
    }, 400);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(showTimerRef.current);
    setPreview(null);
  }, []);

  const cancel = useCallback(() => {
    clearTimeout(showTimerRef.current);
  }, []);

  useEffect(() => {
    return () => clearTimeout(showTimerRef.current);
  }, []);

  return { preview, show, hide, cancel };
}
