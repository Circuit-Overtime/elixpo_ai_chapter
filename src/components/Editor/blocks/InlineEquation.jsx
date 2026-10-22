'use client';

import { createReactInlineContentSpec } from '@blocknote/react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { renderKatex } from '../../../utils/katexRenderer';

function useInlineKatex(latex) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    let active = true;
    if (!latex?.trim()) {
      setHtml('');
      return () => { active = false; };
    }
    renderKatex(latex, false).then((result) => {
      if (active) setHtml(result);
    });
    return () => { active = false; };
  }, [latex]);
  return html;
}

function InlineEquationChip({ inlineContent }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(inlineContent.props.latex || '');
  const inputRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  // Close on click outside
  useEffect(() => {
    if (!editing) return;
    function handleClick(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setEditing(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editing]);

  const save = useCallback(() => {
    if (value.trim()) {
      inlineContent.props.latex = value.trim();
    }
    setEditing(false);
  }, [value, inlineContent]);

  const html = useInlineKatex(inlineContent.props.latex);

  // Live preview while editing
  const previewHtml = useInlineKatex(editing ? value : '');

  return (
    <span className="relative inline-flex items-center">
      <span
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setValue(inlineContent.props.latex || ''); setEditing(!editing); }}
        className="inline-equation-chip"
        data-inline-type="equation"
        data-latex={inlineContent.props.latex}
        {...(html
          ? { dangerouslySetInnerHTML: { __html: html } }
          : { children: inlineContent.props.latex })}
        title={inlineContent.props.latex}
        spellCheck={false}
      />
      {editing && (
        <div
          ref={popupRef}
          className="inline-equation-editor"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="text"
            className="inline-equation-editor-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); save(); }
              if (e.key === 'Escape') { setEditing(false); }
            }}
            placeholder="E = mc^2"
          />
          {previewHtml && (
            <div className="inline-equation-editor-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
          <div className="inline-equation-editor-actions">
            <button className="mermaid-btn-cancel" onClick={() => setEditing(false)}>Cancel</button>
            <button className="mermaid-btn-save" disabled={!value.trim()} onClick={save}>Save</button>
          </div>
        </div>
      )}
    </span>
  );
}

export const InlineEquation = createReactInlineContentSpec(
  {
    type: 'inlineEquation',
    propSchema: {
      latex: { default: 'x^2' },
    },
    content: 'none',
  },
  {
    render: (props) => <InlineEquationChip {...props} />,
    parse: (el) => {
      if (el.getAttribute('data-inline-type') === 'equation' || el.classList.contains('inline-equation-chip')) {
        return { latex: el.getAttribute('data-latex') || el.getAttribute('title') || el.textContent?.trim() || '' };
      }
      return undefined;
    },
  }
);
