'use client';

import { createReactInlineContentSpec } from '@blocknote/react';
import { useState, useRef, useEffect } from 'react';

// Inline button (#22): like an inline link, but rendered as a button chip.
// Created from the selection toolbar (selected text becomes the label); click
// the chip in the editor to edit its label/link.
function InlineButtonChip({ inlineContent }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(inlineContent.props.label || '');
  const [href, setHref] = useState(inlineContent.props.href || '');
  const popupRef = useRef(null);

  useEffect(() => {
    if (!editing) return;
    const onDown = (e) => { if (popupRef.current && !popupRef.current.contains(e.target)) setEditing(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing]);

  const save = () => {
    inlineContent.props.label = label.trim() || 'Button';
    inlineContent.props.href = href.trim();
    setEditing(false);
  };

  const open = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLabel(inlineContent.props.label || '');
    setHref(inlineContent.props.href || '');
    setEditing(true);
  };

  return (
    <span className="relative inline-flex items-center" contentEditable={false}>
      <button
        type="button"
        className="inline-button-chip"
        data-inline-type="button"
        data-href={inlineContent.props.href || ''}
        onClick={open}
        title={inlineContent.props.href || 'Click to edit'}
      >
        {inlineContent.props.label || 'Button'}
      </button>
      {editing && (
        <div ref={popupRef} className="inline-equation-editor" onMouseDown={(e) => e.stopPropagation()}>
          <input
            className="inline-equation-editor-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Button label"
            autoFocus
          />
          <input
            className="inline-equation-editor-input"
            style={{ marginTop: 6 }}
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://..."
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') setEditing(false); }}
          />
          <div className="inline-equation-editor-actions">
            <button className="mermaid-btn-cancel" onClick={() => setEditing(false)}>Cancel</button>
            <button className="mermaid-btn-save" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </span>
  );
}

export const InlineButton = createReactInlineContentSpec(
  {
    type: 'inlineButton',
    propSchema: {
      label: { default: 'Button' },
      href: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => <InlineButtonChip {...props} />,
    parse: (el) => {
      if (el.getAttribute('data-inline-type') === 'button' || el.classList.contains('inline-button-chip')) {
        return { label: el.textContent?.trim() || 'Button', href: el.getAttribute('data-href') || '' };
      }
      return undefined;
    },
  },
);
