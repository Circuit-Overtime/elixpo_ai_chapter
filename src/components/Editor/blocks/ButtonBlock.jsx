'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState, useEffect, useRef } from 'react';

const BUTTON_ACTIONS = [
  { value: 'link', label: 'Open Link' },
  { value: 'copy', label: 'Copy Text' },
  { value: 'scroll-top', label: 'Scroll to Top' },
  { value: 'share', label: 'Share Page' },
];

const BUTTON_VARIANTS = [
  { value: 'primary', label: 'Primary', cls: 'bg-[#9b7bf7] text-[var(--text-primary)] hover:bg-[#b69aff]' },
  { value: 'secondary', label: 'Secondary', cls: 'bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-hover)]' },
  { value: 'accent', label: 'Accent', cls: 'bg-[#9b7bf7] text-[var(--text-primary)] hover:bg-[#b69aff]' },
];

export const ButtonBlock = createReactBlockSpec(
  {
    type: 'buttonBlock',
    propSchema: {
      label: { default: 'Button' },
      action: { default: 'link' },
      actionValue: { default: '' },
      variant: { default: 'primary' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const [editing, setEditing] = useState(!block.props.label || block.props.label === 'Button');
      const [label, setLabel] = useState(block.props.label);
      const [action, setAction] = useState(block.props.action);
      const [actionValue, setActionValue] = useState(block.props.actionValue);
      const [variant, setVariant] = useState(block.props.variant);

      const save = () => {
        editor.updateBlock(block, { props: { label, action, actionValue, variant } });
        setEditing(false);
      };

      if (editing) {
        return (
          <div className="border border-[var(--border-default)] rounded-xl bg-[var(--bg-surface)] p-4 my-2 space-y-3">
            <p className="text-[11px] text-[var(--text-muted)] font-medium">Button Block</p>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Button label"
              className="w-full bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-hover)] placeholder-[#6b7a8d]"
            />
            <div className="flex gap-2">
              <select value={action} onChange={(e) => setAction(e.target.value)} className="bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none flex-1">
                {BUTTON_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <select value={variant} onChange={(e) => setVariant(e.target.value)} className="bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none">
                {BUTTON_VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            {(action === 'link' || action === 'copy') && (
              <input
                type="text"
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                placeholder={action === 'link' ? 'https://...' : 'Text to copy'}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-hover)] placeholder-[#6b7a8d]"
              />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(false)} className="px-3 py-1 text-[12px] text-[#888] hover:text-[var(--text-primary)] transition-colors">Cancel</button>
              <button onClick={save} className="px-3 py-1 text-[12px] bg-[#9b7bf7] text-[var(--text-primary)] rounded-md font-medium hover:bg-[#b69aff] transition-colors">Done</button>
            </div>
          </div>
        );
      }

      const variantCls = BUTTON_VARIANTS.find((v) => v.value === variant)?.cls || BUTTON_VARIANTS[0].cls;

      return (
        <div className="my-2" onDoubleClick={() => setEditing(true)}>
          <button className={`px-5 py-2 rounded-lg text-[13px] font-medium transition-colors ${variantCls}`}>
            {label}
          </button>
        </div>
      );
    },
  }
);
