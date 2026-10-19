'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../../context/ThemeContext';
import { getCachedMermaidSvg, renderMermaidSvg } from '../../../utils/mermaidRenderer';

const pendingEditorFocus = new Set();

export function requestMermaidEditorFocus(blockId) {
  if (!blockId) return;
  pendingEditorFocus.add(blockId);

  let attempts = 0;
  const focusWhenMounted = () => {
    const textarea = document.querySelector(
      `[data-id="${CSS.escape(blockId)}"] .mermaid-block-textarea`,
    );
    if (textarea) {
      pendingEditorFocus.delete(blockId);
      textarea.focus({ preventScroll: true });
      return;
    }
    if (attempts++ < 6) {
      requestAnimationFrame(focusWhenMounted);
    } else {
      pendingEditorFocus.delete(blockId);
    }
  };
  requestAnimationFrame(focusWhenMounted);
}

// Shared component that renders a mermaid diagram to SVG
function MermaidPreview({ diagram, isDark, interactive, cancelStale = false }) {
  const containerRef = useRef(null);
  const [isNearViewport, setIsNearViewport] = useState(!interactive);
  // Reuse a completed render when BlockNote remounts a node view. Starting an
  // interactive preview empty caused a visible placeholder flash on each remount.
  const [svgHTML, setSvgHTML] = useState(() => getCachedMermaidSvg(diagram, isDark));
  const [error, setError] = useState('');
  const [errorCopied, setErrorCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  // Saved diagrams are expensive SVG trees, so defer their first render until
  // they approach the viewport. Hydration is deliberately one-way: unmounting
  // an SVG when its intersection changes can alter layout, bounce the observer,
  // and make the preview flash indefinitely.
  useEffect(() => {
    if (!interactive) {
      setIsNearViewport(true);
      return;
    }
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }
    const rect = element.getBoundingClientRect();
    const margin = 900;
    if (rect.bottom >= -margin && rect.top <= window.innerHeight + margin) {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: '900px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [interactive]);

  useEffect(() => {
    if (!diagram?.trim()) {
      setSvgHTML('');
      setError('');
      return;
    }
    if (interactive && !isNearViewport) {
      return;
    }
    let active = true;
    const controller = cancelStale ? new AbortController() : null;
    renderMermaidSvg(diagram, isDark, controller?.signal).then((svg) => {
      if (active) {
        setSvgHTML(svg);
        setError('');
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }).catch((err) => {
      if (active && err?.name !== 'AbortError') {
        setError(err.message || 'Invalid diagram syntax');
        setSvgHTML('');
      }
    });

    return () => {
      active = false;
      controller?.abort();
    };
  }, [diagram, isDark, cancelStale, interactive, isNearViewport]);

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
    if (!interactive || !svgHTML || !isNearViewport) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, interactive, svgHTML, isNearViewport]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (error) {
    return (
      <div ref={containerRef} className="mermaid-viewport mermaid-viewport--compact mermaid-error-output">
        <button
          type="button"
          className="mermaid-error-copy"
          onClick={async (event) => {
            event.stopPropagation();
            await navigator.clipboard.writeText(error).catch(() => {});
            setErrorCopied(true);
            setTimeout(() => setErrorCopied(false), 1500);
          }}
          title="Copy Mermaid error"
        >
          <ion-icon name={errorCopied ? 'checkmark-outline' : 'copy-outline'} />
          {errorCopied ? 'Copied' : 'Copy error'}
        </button>
        <pre style={{ color: '#f87171', fontSize: '12px', whiteSpace: 'pre-wrap', padding: '16px', margin: 0 }}>{error}</pre>
      </div>
    );
  }

  if (!diagram?.trim()) {
    return (
      <div ref={containerRef} className="mermaid-viewport mermaid-viewport--compact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>Preview will appear here...</span>
      </div>
    );
  }

  if (!svgHTML) {
    return (
      <div ref={containerRef} className="mermaid-viewport mermaid-viewport--compact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-faint)', fontSize: '13px' }}>
          {interactive && !isNearViewport ? 'Diagram preview' : 'Rendering...'}
        </span>
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
      editingDraft: { default: '' },
      isEditing: { default: false },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const { isDark } = useTheme();
      const initialDraft = block.props.isEditing
        ? block.props.editingDraft || block.props.diagram || ''
        : block.props.diagram || '';
      const [editing, setEditing] = useState(block.props.isEditing || !block.props.diagram);
      const [value, setValue] = useState(initialDraft);
      const [livePreview, setLivePreview] = useState(initialDraft);
      const inputRef = useRef(null);
      const lineGutterRef = useRef(null);
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
        if (!pendingEditorFocus.delete(block.id)) return;
        const raf = requestAnimationFrame(() => {
          inputRef.current?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(raf);
      }, [block.id]);

      useEffect(() => {
        const startedEditing = editing && !previousEditingRef.current;
        previousEditingRef.current = editing;
        if (!startedEditing) return;

        // Focus only for an explicit closed → open transition. Empty blocks
        // start open, and BlockNote can remount node views as selection moves;
        // auto-focusing those mounts steals the cursor and scrolls the page.
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
      const persistEditingDraft = useCallback((nextValue) => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          setLivePreview(nextValue);
          try {
            editor.updateBlock(block.id, {
              props: { editingDraft: nextValue, isEditing: true },
            });
          } catch {}
        }, 400);
      }, [editor, block.id]);

      const handleCodeChange = useCallback((e) => {
        const nextValue = e.target.value;
        setValue(nextValue);
        persistEditingDraft(nextValue);
      }, [persistEditingDraft]);

      const handleCodePaste = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();

        const input = e.currentTarget;
        const pasted = e.clipboardData.getData('text/plain');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const nextValue = value.slice(0, start) + pasted + value.slice(end);

        setValue(nextValue);
        persistEditingDraft(nextValue);
        requestAnimationFrame(() => {
          const cursor = start + pasted.length;
          input.setSelectionRange(cursor, cursor);
        });
      }, [value, persistEditingDraft]);

      useEffect(() => {
        return () => clearTimeout(debounceRef.current);
      }, []);

      const save = useCallback(() => {
        clearTimeout(debounceRef.current);
        editor.updateBlock(block.id, {
          props: { diagram: value, editingDraft: '', isEditing: false },
        });
        setEditing(false);

        // Completing a custom block should return the author to normal writing.
        // Reuse an existing paragraph directly below the diagram, otherwise add
        // one, then focus it after the Mermaid node view has finished rerendering.
        requestAnimationFrame(() => {
          try {
            const documentBlocks = editor.document;
            const blockIndex = documentBlocks.findIndex((item) => item.id === block.id);
            if (blockIndex < 0) return;

            let nextBlock = documentBlocks[blockIndex + 1];
            if (!nextBlock || nextBlock.type !== 'paragraph') {
              editor.insertBlocks(
                [{ type: 'paragraph', content: [] }],
                block.id,
                'after',
              );
              nextBlock = editor.document[blockIndex + 1];
            }
            if (!nextBlock) return;

            requestAnimationFrame(() => {
              try {
                editor.setTextCursorPosition(nextBlock.id, 'start');
                editor._tiptapEditor?.commands?.focus();
              } catch {}
            });
          } catch {}
        });
      }, [editor, block.id, value]);

      const beginEditing = useCallback(() => {
        const nextValue = block.props.editingDraft || block.props.diagram || '';
        setValue(nextValue);
        setLivePreview(nextValue);
        setEditing(true);
        try {
          editor.updateBlock(block.id, {
            props: { editingDraft: nextValue, isEditing: true },
          });
        } catch {}
      }, [editor, block.id, block.props.diagram, block.props.editingDraft]);

      const cancelEditing = useCallback(() => {
        clearTimeout(debounceRef.current);
        setEditing(false);
        setValue(block.props.diagram || '');
        setLivePreview(block.props.diagram || '');
        try {
          editor.updateBlock(block.id, {
            props: { editingDraft: '', isEditing: false },
          });
        } catch {}
      }, [editor, block.id, block.props.diagram]);

      const handleDelete = useCallback(() => {
        try { editor.removeBlocks([block.id]); } catch {}
      }, [editor, block.id]);

      if (editing) {
        return (
          <div
            className="mermaid-block mermaid-block--editing"
            contentEditable={false}
            suppressContentEditableWarning
          >
            <div className="mermaid-block-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/>
              </svg>
              <span>Mermaid Diagram</span>
              <span className="mermaid-supported-types">Flowchart · Sequence · Class · ER</span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-faint)' }}>Shift+Enter to save</span>
            </div>
            <div className="mermaid-code-editor">
              <div
                ref={lineGutterRef}
                className="mermaid-line-numbers"
                aria-hidden="true"
              >
                {Array.from({ length: Math.max(1, value.split('\n').length) }, (_, index) => (
                  <span key={index}>{index + 1}</span>
                ))}
              </div>
              <textarea
                ref={inputRef}
                draggable={false}
                value={value}
                onChange={handleCodeChange}
                onBlur={() => {
                  clearTimeout(debounceRef.current);
                  try {
                    editor.updateBlock(block.id, {
                      props: { editingDraft: value, isEditing: true },
                    });
                  } catch {}
                }}
                onScroll={(event) => {
                  if (lineGutterRef.current) {
                    lineGutterRef.current.scrollTop = event.currentTarget.scrollTop;
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.focus();
                }}
                onPaste={handleCodePaste}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); save(); }
                  if (e.key === 'Escape') cancelEditing();
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = e.target.selectionStart;
                    const end = e.target.selectionEnd;
                    const newVal = value.substring(0, start) + '    ' + value.substring(end);
                    setValue(newVal);
                    persistEditingDraft(newVal);
                    requestAnimationFrame(() => {
                      e.target.selectionStart = e.target.selectionEnd = start + 4;
                    });
                  }
                }}
                placeholder={`graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[OK]\n    B -->|No| D[End]`}
                rows={8}
                className="mermaid-block-textarea"
              />
            </div>
            {/* Live preview panel */}
            <div className="mermaid-live-preview">
              <div className="mermaid-live-preview-label">Preview</div>
              <MermaidPreview diagram={livePreview} isDark={isDark} interactive={false} cancelStale />
            </div>
            <div className="mermaid-block-actions">
              <button onClick={cancelEditing} className="mermaid-btn-cancel">Cancel</button>
              <button onClick={save} className="mermaid-btn-save" disabled={!value.trim()}>Done</button>
            </div>
          </div>
        );
      }

      if (!block.props.diagram) {
        return (
          <div contentEditable={false} onClick={beginEditing} className="mermaid-block mermaid-block--empty">
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
        <div contentEditable={false} className="mermaid-block mermaid-block--rendered group" onDoubleClick={beginEditing}>
          <MermaidPreview diagram={block.props.diagram} isDark={isDark} interactive />
          <div className="mermaid-block-hover">
            <button onClick={() => setIsFullscreen(true)} className="mermaid-hover-btn" title="Fullscreen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            </button>
            <button onClick={beginEditing} className="mermaid-hover-btn" title="Edit diagram">
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
