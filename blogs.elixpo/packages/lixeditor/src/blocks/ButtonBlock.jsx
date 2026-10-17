'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState } from 'react';

const BUTTON_ACTIONS = [
  { value: 'link', label: 'Open Link' },
  { value: 'copy', label: 'Copy Text' },
  { value: 'scroll-top', label: 'Scroll to Top' },
  { value: 'share', label: 'Share Page' },
];

const BUTTON_VARIANTS = [
  { value: 'solid', label: 'Solid' },
  { value: 'outline', label: 'Outline' },
];

const ALIGN = ['left', 'center', 'right'];

// 2.7.0 contract: { text, url, align, variant: solid|outline, color, radius }.
// Legacy fields (label, action, actionValue + variant primary/secondary/accent)
// are kept in the schema for backward compatibility and read as fallbacks.
export const ButtonBlock = createReactBlockSpec(
  {
    type: 'buttonBlock',
    propSchema: {
      // email contract
      text: { default: '' },
      url: { default: '' },
      align: { default: 'left' },
      variant: { default: 'solid' },
      color: { default: '#7c5cff' },
      radius: { default: 8 },
      // legacy / interactive (kept for back-compat)
      label: { default: '' },
      action: { default: 'link' },
      actionValue: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const p = block.props;
      const initialText = p.text || p.label || '';
      const initialUrl = p.url || (p.action === 'link' ? p.actionValue : '') || '';
      // Normalize a legacy variant (primary/accent → solid, secondary → outline).
      const initialVariant = p.variant === 'outline' || p.variant === 'secondary' ? 'outline' : 'solid';

      const [editing, setEditing] = useState(!initialText);
      const [text, setText] = useState(initialText);
      const [url, setUrl] = useState(initialUrl);
      const [align, setAlign] = useState(p.align || 'left');
      const [variant, setVariant] = useState(initialVariant);
      const [color, setColor] = useState(p.color || '#7c5cff');
      const [radius, setRadius] = useState(p.radius ?? 8);

      const save = () => {
        editor.updateBlock(block, {
          props: {
            text, url, align, variant, color, radius: Number(radius) || 0,
            // mirror into legacy fields so older renderers still work
            label: text, action: 'link', actionValue: url,
          },
        });
        setEditing(false);
      };

      if (editing) {
        return (
          <div className="lix-btn-editor">
            <p className="lix-btn-editor-title">Button</p>
            <label className="lix-btn-editor-field">
              <span className="lix-btn-editor-label">Text</span>
              <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Get started" className="lix-btn-editor-input" />
            </label>
            <label className="lix-btn-editor-field">
              <span className="lix-btn-editor-label">Link URL</span>
              <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…  (supports {{variables}})" className="lix-btn-editor-input" />
            </label>
            <div className="lix-btn-editor-row">
              <label className="lix-btn-editor-field">
                <span className="lix-btn-editor-label">Align</span>
                <select value={align} onChange={(e) => setAlign(e.target.value)} className="lix-btn-editor-select">
                  {ALIGN.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label className="lix-btn-editor-field">
                <span className="lix-btn-editor-label">Style</span>
                <select value={variant} onChange={(e) => setVariant(e.target.value)} className="lix-btn-editor-select">
                  {BUTTON_VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </label>
              <label className="lix-btn-editor-field">
                <span className="lix-btn-editor-label">Color</span>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Color" className="lix-btn-editor-color" />
              </label>
              <label className="lix-btn-editor-field">
                <span className="lix-btn-editor-label">Radius</span>
                <input type="number" min="0" max="40" value={radius} onChange={(e) => setRadius(e.target.value)} title="Corner radius (px)" className="lix-btn-editor-input lix-btn-editor-radius" />
              </label>
            </div>
            <div className="lix-btn-editor-actions">
              <button onClick={() => setEditing(false)} className="lix-btn-editor-cancel">Cancel</button>
              <button onClick={save} className="lix-btn-editor-done">Done</button>
            </div>
          </div>
        );
      }

      const solid = variant !== 'outline';
      const btnStyle = solid
        ? { background: color, color: '#fff', border: `2px solid ${color}` }
        : { background: 'transparent', color, border: `2px solid ${color}` };

      return (
        <div className="lix-btn-wrap" style={{ textAlign: align }} onDoubleClick={() => setEditing(true)}>
          <button
            className="lix-btn"
            style={{ ...btnStyle, borderRadius: `${Number(radius) || 0}px` }}
          >
            {text || 'Button'}
          </button>
        </div>
      );
    },
  }
);
