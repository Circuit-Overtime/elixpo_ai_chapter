'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLixTheme as useTheme } from '../hooks/useLixTheme';
import { getMermaidConfig, normalizeMermaidSource, prepareMermaidSvg } from '../utils/mermaidConfig';

let mermaidModule = null;
let mermaidLoadPromise = null;
let renderQueue = Promise.resolve();
let lastTheme = null;

async function getMermaid(isDark) {
  if (!mermaidModule) {
    if (!mermaidLoadPromise) {
      // Import the full ESM bundle — the default 'mermaid' export maps to mermaid.core.mjs
      // which strips gitGraph, pie, timeline, etc. via lazy-loading that breaks with webpack.
      mermaidLoadPromise = import('mermaid').then(m => {
        mermaidModule = m.default;
        return mermaidModule;
      });
    }
    await mermaidLoadPromise;
  }
  const theme = isDark ? 'dark' : 'light';
  if (lastTheme !== theme) {
    lastTheme = theme;
    mermaidModule.initialize(getMermaidConfig(isDark));
  }
  return mermaidModule;
}

// Serialize render calls — mermaid is a singleton and concurrent renders cause conflicts
function queueRender(fn) {
  renderQueue = renderQueue.then(fn, fn);
  return renderQueue;
}

// Shared component that renders a mermaid diagram to SVG
function MermaidPreview({ diagram, isDark, interactive }) {
  const containerRef = useRef(null);
  const [svgHTML, setSvgHTML] = useState('');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!diagram?.trim()) {
      setSvgHTML('');
      setError('');
      return;
    }
    let cancelled = false;
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    queueRender(async () => {
      if (cancelled) return;
      try {
        const mermaid = await getMermaid(isDark);
        if (cancelled) return;

        const diagramText = normalizeMermaidSource(diagram);

        const tempDiv = document.createElement('div');
        tempDiv.id = 'container-' + id;
        tempDiv.style.cssText = 'position:fixed;top:0;left:0;width:100vw;opacity:0;pointer-events:none;z-index:-9999;';
        document.body.appendChild(tempDiv);

        const { svg } = await mermaid.render(id, diagramText, tempDiv);
        tempDiv.remove();

        if (!cancelled) {
          setSvgHTML(prepareMermaidSvg(svg));
          setError('');
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Invalid diagram syntax');
          setSvgHTML('');
        }
        try { document.getElementById(id)?.remove(); } catch {}
        try { document.getElementById('container-' + id)?.remove(); } catch {}
      }
    });

    return () => { cancelled = true; };
  }, [diagram, isDark]);

  // Mouse wheel zoom
  useEffect(() => {
    if (!interactive) return;
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        return Math.min(3, Math.max(0.3, z + delta));
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [svgHTML, interactive]);

  // Pan via drag
  const handleMouseDown = useCallback((e) => {
    if (!interactive || e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  }, [pan, interactive]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  useEffect(() => {
    if (!interactive) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, interactive]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (error) {
    return (
      <div className="mermaid-viewport mermaid-viewport--compact">
        <pre style={{ color: '#f87171', fontSize: '12px', whiteSpace: 'pre-wrap', padding: '16px', margin: 0 }}>{error}</pre>
      </div>
    );
  }

  if (!diagram?.trim()) {
    return (
      <div className="mermaid-viewport mermaid-viewport--compact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>Preview will appear here...</span>
      </div>
    );
  }

  if (!svgHTML) {
    return (
      <div className="mermaid-viewport mermaid-viewport--compact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Rendering...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={interactive ? 'mermaid-viewport' : 'mermaid-viewport mermaid-viewport--compact'}
      onMouseDown={handleMouseDown}
    >
      <div
        className="mermaid-block-svg"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
        dangerouslySetInnerHTML={{ __html: svgHTML }}
      />
      {interactive && (
        <div className="mermaid-zoom-controls" onMouseDown={(event) => event.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(3, z + 0.2)); }}
            className="mermaid-zoom-btn"
            title="Zoom in"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <span className="mermaid-zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(0.3, z - 0.2)); }}
            className="mermaid-zoom-btn"
            title="Zoom out"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); resetView(); }}
            className="mermaid-zoom-btn"
            title="Reset view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><polyline points="1 4 1 10 7 10"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export const MermaidBlock = createReactBlockSpec(
  {
    type: 'mermaidBlock',
    propSchema: {
      diagram: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const { isDark } = useTheme();
      const [editing, setEditing] = useState(!block.props.diagram);
      const [value, setValue] = useState(block.props.diagram || '');
      const [livePreview, setLivePreview] = useState(block.props.diagram || '');
      const inputRef = useRef(null);
      const debounceRef = useRef(null);
      const previousEditingRef = useRef(editing);
      const [isFullscreen, setIsFullscreen] = useState(false);

      useEffect(() => {
        if (!isFullscreen) return;
        const handleKeyDown = (e) => {
          if (e.key === 'Escape') {
            setIsFullscreen(false);
          }
        };
        window.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
          window.removeEventListener('keydown', handleKeyDown);
          document.body.style.overflow = '';
        };
      }, [isFullscreen]);

      useEffect(() => {
        const startedEditing = editing && !previousEditingRef.current;
        previousEditingRef.current = editing;
        if (!startedEditing) return;

        const raf = requestAnimationFrame(() => {
          const el = inputRef.current;
          if (el) {
            el.focus({ preventScroll: true });
            el.setSelectionRange(el.value.length, el.value.length);
          }
        });
        return () => cancelAnimationFrame(raf);
      }, [editing]);

      // Debounced live preview update while typing
      const handleCodeChange = useCallback((e) => {
        const v = e.target.value;
        setValue(v);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setLivePreview(v), 400);
      }, []);

      const handleCodePaste = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();

        const input = e.currentTarget;
        const pasted = e.clipboardData.getData('text/plain');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const nextValue = value.slice(0, start) + pasted + value.slice(end);

        setValue(nextValue);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setLivePreview(nextValue), 400);
        requestAnimationFrame(() => {
          const cursor = start + pasted.length;
          input.setSelectionRange(cursor, cursor);
        });
      }, [value]);

      useEffect(() => {
        return () => clearTimeout(debounceRef.current);
      }, []);

      const save = useCallback(() => {
        editor.updateBlock(block, { props: { diagram: value } });
        setEditing(false);
      }, [editor, block, value]);

      const handleDelete = useCallback(() => {
        try { editor.removeBlocks([block.id]); } catch {}
      }, [editor, block.id]);

      if (editing) {
        return (
          <div className="mermaid-block mermaid-block--editing">
            <div className="mermaid-block-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
              </svg>
              <span>Mermaid Diagram</span>
              <span className="mermaid-supported-types">Flowchart · Sequence · Class · ER</span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-faint)' }}>Shift+Enter to save</span>
            </div>
            <textarea
              ref={inputRef}
              value={value}
              onChange={handleCodeChange}
              onMouseDown={(e) => e.stopPropagation()}
              onPaste={handleCodePaste}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === 'Escape') { setEditing(false); setValue(block.props.diagram || ''); setLivePreview(block.props.diagram || ''); }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const start = e.target.selectionStart;
                  const end = e.target.selectionEnd;
                  const newVal = value.substring(0, start) + '    ' + value.substring(end);
                  setValue(newVal);
                  setLivePreview(newVal);
                  requestAnimationFrame(() => {
                    e.target.selectionStart = e.target.selectionEnd = start + 4;
                  });
                }
              }}
              placeholder={`graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[OK]\n    B -->|No| D[End]`}
              rows={8}
              className="mermaid-block-textarea"
            />
            {/* Live preview panel */}
            <div className="mermaid-live-preview">
              <div className="mermaid-live-preview-label">Preview</div>
              <MermaidPreview diagram={livePreview} isDark={isDark} interactive={false} />
            </div>
            <div className="mermaid-block-actions">
              <button onClick={() => { setEditing(false); setValue(block.props.diagram || ''); setLivePreview(block.props.diagram || ''); }} className="mermaid-btn-cancel">Cancel</button>
              <button onClick={save} className="mermaid-btn-save" disabled={!value.trim()}>Done</button>
            </div>
          </div>
        );
      }

      if (!block.props.diagram) {
        return (
          <div onClick={() => setEditing(true)} className="mermaid-block mermaid-block--empty">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="8.5" y="14" width="7" height="7" rx="1.5" />
              <line x1="6.5" y1="10" x2="6.5" y2="14" />
              <line x1="17.5" y1="10" x2="17.5" y2="14" />
              <line x1="6.5" y1="14" x2="8.5" y2="14" />
              <line x1="17.5" y1="14" x2="15.5" y2="14" />
            </svg>
            <span>Click to add a Mermaid diagram</span>
            <span className="mermaid-empty-types">Flowchart · Sequence · Class · ER</span>
          </div>
        );
      }

      return (
        <div className="mermaid-block mermaid-block--rendered group" onDoubleClick={() => setEditing(true)}>
          <MermaidPreview diagram={block.props.diagram} isDark={isDark} interactive />
          <div className="mermaid-block-hover">
            <button onClick={() => setIsFullscreen(true)} className="mermaid-hover-btn" title="Fullscreen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            </button>
            <button onClick={() => setEditing(true)} className="mermaid-hover-btn" title="Edit diagram">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button onClick={handleDelete} className="mermaid-hover-btn mermaid-hover-delete" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
          {isFullscreen && createPortal(
            <div className="mermaid-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Fullscreen Mermaid Diagram">
              <div className="mermaid-fullscreen-header">
                <span className="mermaid-fullscreen-title">Mermaid Diagram</span>
                <div className="mermaid-fullscreen-controls">
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="mermaid-fullscreen-btn close-btn"
                    title="Close fullscreen"
                    aria-label="Close fullscreen"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mermaid-fullscreen-content">
                <div className="mermaid-fullscreen-inner-container">
                  <MermaidPreview diagram={block.props.diagram} isDark={isDark} interactive={true} />
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      );
    },
  }
);
