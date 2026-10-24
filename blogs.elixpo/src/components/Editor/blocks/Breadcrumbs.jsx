'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState } from 'react';

// Breadcrumbs block (#23): a structured, easy-to-edit segment builder.
// Click the trail (or the Edit button) to open the editor; each segment has a
// label + optional URL with add/remove, plus a live preview of the trail.
export const Breadcrumbs = createReactBlockSpec(
  {
    type: 'breadcrumbs',
    propSchema: {
      items: { default: '[]' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      let initial = [];
      try { initial = JSON.parse(block.props.items); } catch {}

      const [editing, setEditing] = useState(initial.length === 0);
      const [segments, setSegments] = useState(
        initial.length ? initial : [{ label: '', href: '' }],
      );

      const update = (i, field, value) =>
        setSegments((s) => s.map((seg, idx) => (idx === i ? { ...seg, [field]: value } : seg)));
      const addSegment = () => setSegments((s) => [...s, { label: '', href: '' }]);
      const removeSegment = (i) => setSegments((s) => s.filter((_, idx) => idx !== i));

      const save = () => {
        const cleaned = segments
          .map((s) => ({ label: (s.label || '').trim(), href: (s.href || '').trim() }))
          .filter((s) => s.label);
        editor.updateBlock(block, { props: { items: JSON.stringify(cleaned) } });
        setSegments(cleaned.length ? cleaned : [{ label: '', href: '' }]);
        setEditing(false);
      };

      if (editing) {
        return (
          <div className="border border-[var(--border-default)] rounded-xl bg-[var(--bg-surface)] p-4 my-2">
            <div className="flex items-center gap-2 mb-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9b7bf7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-3 4 6 3-3h4" /></svg>
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">Breadcrumbs</span>
            </div>

            <div className="space-y-2">
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-faint)] w-5 text-right">{i + 1}</span>
                  <input
                    value={seg.label}
                    onChange={(e) => update(i, 'label', e.target.value)}
                    placeholder="Label (e.g. Home)"
                    className="flex-1 bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-hover)] placeholder-[#6b7a8d]"
                  />
                  <input
                    value={seg.href}
                    onChange={(e) => update(i, 'href', e.target.value)}
                    placeholder="URL (optional)"
                    className="flex-1 bg-[var(--bg-app)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-hover)] placeholder-[#6b7a8d] font-mono"
                  />
                  <button
                    onClick={() => removeSegment(i)}
                    disabled={segments.length === 1}
                    title="Remove segment"
                    className="text-[var(--text-faint)] hover:text-[#f87171] disabled:opacity-30 transition-colors p-1"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>

            <button onClick={addSegment} className="flex items-center gap-1.5 mt-2.5 text-[12px] text-[#9b7bf7] hover:text-[#b69aff] transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add segment
            </button>

            {/* Live preview */}
            <div className="flex items-center gap-1.5 text-[13px] mt-3 pt-3 border-t border-[var(--divider)] flex-wrap">
              {segments.filter((s) => (s.label || '').trim()).map((seg, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-[#4a5568]">/</span>}
                  <span className={seg.href ? 'text-[#9b7bf7]' : 'text-[var(--text-muted)]'}>{seg.label}</span>
                </span>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setEditing(false)} className="px-3 py-1 text-[12px] text-[#888]">Cancel</button>
              <button onClick={save} className="px-3 py-1 text-[12px] bg-[#9b7bf7] text-[var(--text-primary)] rounded-md font-medium hover:bg-[#b69aff] transition-colors">Done</button>
            </div>
          </div>
        );
      }

      return (
        <div className="group flex items-center gap-1.5 text-[13px] my-2 flex-wrap cursor-pointer" onClick={() => setEditing(true)} title="Click to edit breadcrumbs">
          {initial.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[#4a5568]">/</span>}
              <span className={item.href ? 'text-[#9b7bf7] hover:text-[#b69aff] transition-colors' : 'text-[var(--text-muted)]'}>{item.label}</span>
            </span>
          ))}
          <svg className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-[var(--text-faint)]" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
        </div>
      );
    },
  },
);
