'use client';

import { createReactInlineContentSpec } from '@blocknote/react';
import { useState, useRef, useEffect } from 'react';

// Host-supplied merge-variable names (e.g. ["firstName","amount"]). Set via the
// `variableSuggestions` prop on <LixEditor>; mirrors setLinkPreviewEndpoint.
let VARIABLE_SUGGESTIONS = [];
export function setVariableSuggestions(list) {
  VARIABLE_SUGGESTIONS = Array.isArray(list) ? list : [];
}

function VariableChip({ inlineContent }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(inlineContent.props.name || '');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const commit = (v) => {
    const clean = String(v || '').trim().replace(/[{}]/g, '');
    inlineContent.props.name = clean;
    setName(clean);
    setOpen(false);
  };

  return (
    <span className="relative inline-flex items-center" ref={ref}>
      <span
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[13px] font-medium mx-0.5 cursor-pointer transition-all hover:ring-2 hover:ring-[#9b7bf7]/30"
        style={{ color: '#9b7bf7', backgroundColor: 'rgba(155,123,247,0.08)', border: '1px solid rgba(155,123,247,0.2)', fontFamily: 'ui-monospace, monospace' }}
        title="Merge variable — exported as literal {{name}}"
      >
        {`{{ ${inlineContent.props.name || 'variable'} }}`}
      </span>
      {open && (
        <span
          className="absolute z-[100] top-full left-0 mt-1 rounded-lg shadow-2xl p-2 flex flex-col gap-1"
          style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-default)', minWidth: '180px' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(name); if (e.key === 'Escape') setOpen(false); }}
            placeholder="variable name"
            className="px-2 py-1 text-[12px] rounded outline-none"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontFamily: 'ui-monospace, monospace' }}
          />
          {VARIABLE_SUGGESTIONS.length > 0 && (
            <span className="flex flex-col max-h-40 overflow-y-auto">
              {VARIABLE_SUGGESTIONS
                .filter((s) => s.toLowerCase().includes(name.toLowerCase()))
                .slice(0, 8)
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => commit(s)}
                    className="text-left px-2 py-1 text-[12px] rounded hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-body)', fontFamily: 'ui-monospace, monospace' }}
                  >
                    {`{{ ${s} }}`}
                  </button>
                ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export const VariableInline = createReactInlineContentSpec(
  {
    type: 'lixVariable',
    propSchema: { name: { default: '' } },
    content: 'none',
  },
  {
    render: (props) => <VariableChip {...props} />,
  }
);
