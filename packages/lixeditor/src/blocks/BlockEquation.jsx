'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import katex from 'katex';

// Strip \[...\], $$...$$, \(...\), $...$ delimiters — KaTeX expects the inner expression only
function stripDelimiters(raw) {
  let s = raw.trim();
  if (s.startsWith('\\[') && s.endsWith('\\]')) return s.slice(2, -2).trim();
  if (s.startsWith('$$') && s.endsWith('$$')) return s.slice(2, -2).trim();
  if (s.startsWith('\\(') && s.endsWith('\\)')) return s.slice(2, -2).trim();
  if (s.startsWith('$') && s.endsWith('$') && s.length > 2) return s.slice(1, -1).trim();
  return s;
}

function renderKaTeX(latex, displayMode = true) {
  try {
    return katex.renderToString(stripDelimiters(latex), { displayMode, throwOnError: false });
  } catch {
    return `<span style="color:#f87171">${latex}</span>`;
  }
}

export const BlockEquation = createReactBlockSpec(
  {
    type: 'blockEquation',
    propSchema: {
      latex: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const [editing, setEditing] = useState(!block.props.latex);
      const [value, setValue] = useState(block.props.latex || '');
      const [livePreview, setLivePreview] = useState(block.props.latex || '');
      const inputRef = useRef(null);
      const debounceRef = useRef(null);

      useEffect(() => {
        if (editing) inputRef.current?.focus();
      }, [editing]);

      const handleCodeChange = useCallback((e) => {
        const v = e.target.value;
        setValue(v);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setLivePreview(v), 200);
      }, []);

      useEffect(() => {
        return () => clearTimeout(debounceRef.current);
      }, []);

      const save = () => {
        editor.updateBlock(block, { props: { latex: value } });
        setEditing(false);
      };

      if (editing) {
        return (
          <div className="mermaid-block mermaid-block--editing">
            <div className="mermaid-block-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>
              </svg>
              <span>LaTeX Equation</span>
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-faint)' }}>Shift+Enter to save</span>
            </div>
            <textarea
              ref={inputRef}
              value={value}
              onChange={handleCodeChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === 'Escape') { setEditing(false); setValue(block.props.latex || ''); setLivePreview(block.props.latex || ''); }
              }}
              placeholder="E = mc^2"
              rows={4}
              className="mermaid-block-textarea"
            />
            {/* Live KaTeX preview */}
            {livePreview.trim() && (
              <div className="latex-live-preview">
                <div className="latex-live-preview-label">Preview</div>
                <div dangerouslySetInnerHTML={{ __html: renderKaTeX(livePreview) }} />
              </div>
            )}
            <div className="mermaid-block-actions">
              <button onClick={() => { setEditing(false); setValue(block.props.latex || ''); setLivePreview(block.props.latex || ''); }} className="mermaid-btn-cancel">Cancel</button>
              <button onClick={save} className="mermaid-btn-save" disabled={!value.trim()}>Done</button>
            </div>
          </div>
        );
      }

      const latex = block.props.latex;
      if (!latex) {
        return (
          <div
            onClick={() => setEditing(true)}
            className="mermaid-block mermaid-block--empty"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>
            </svg>
            <span>Click to add a block equation</span>
          </div>
        );
      }

      return (
        <div
          onClick={() => setEditing(true)}
          className="editor-block-equation"
          dangerouslySetInnerHTML={{ __html: renderKaTeX(latex) }}
        />
      );
    },
  }
);
