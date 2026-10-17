'use client';

import { createReactBlockSpec } from '@blocknote/react';

export const TableOfContents = createReactBlockSpec(
  {
    type: 'tableOfContents',
    propSchema: {},
    content: 'none',
  },
  {
    render: ({ editor }) => {
      const headings = editor.document.filter(
        (b) => b.type === 'heading' && b.content?.length > 0
      );

      return (
        <div className="toc-block border border-[var(--border-default)] rounded-xl bg-[var(--bg-surface)] px-5 py-4 my-2 select-none">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-3">Table of Contents</p>
          {headings.length === 0 ? (
            <p className="text-[13px] text-[var(--text-faint)] italic">Add headings to see the outline here.</p>
          ) : (
            <ul className="space-y-1.5">
              {headings.map((h) => {
                const level = h.props?.level || 1;
                const text = h.content.map((c) => c.text || '').join('');
                return (
                  <li
                    key={h.id}
                    className="text-[13px] text-[#9b7bf7] hover:text-[#b69aff] cursor-pointer transition-colors"
                    style={{ paddingLeft: `${(level - 1) * 16}px` }}
                    onClick={() => editor.setTextCursorPosition(h.id)}
                  >
                    {text}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      );
    },
  }
);
