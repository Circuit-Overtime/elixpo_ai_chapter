'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useEffect, useState } from 'react';

function TocView({ editor }) {
  const headings = editor.document.filter(
    (b) => b.type === 'heading' && b.content?.length > 0
  );

  const [progress, setProgress] = useState(0); // 0–100 overall reading progress
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (headings.length === 0) return;

    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
      setProgress(p);

      // Active = last heading scrolled past the top band.
      let current = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = document.querySelector(`[data-id="${h.id}"]`);
        if (el && el.getBoundingClientRect().top <= 120) current = h.id;
      }
      setActiveId(current);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [headings.length]);

  const goTo = (id) => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else editor.setTextCursorPosition?.(id);
  };

  return (
    <div className="toc-block border border-[var(--border-default)] rounded-xl bg-[var(--bg-surface)] px-5 py-4 my-2 select-none">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-bold">Table of Contents</p>
        {headings.length > 0 && (
          <span
            className="text-[11px] font-bold tabular-nums transition-colors"
            style={{ color: progress > 0 ? '#9b7bf7' : 'var(--text-faint)' }}
          >
            {Math.round(progress)}%
          </span>
        )}
      </div>

      {headings.length === 0 ? (
        <p className="text-[13px] text-[var(--text-faint)] italic">Add headings to see the outline here.</p>
      ) : (
        <div className="flex gap-3">
          {/* Vertical progress rail */}
          <div className="relative w-[3px] shrink-0 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <div
              className="absolute top-0 left-0 w-full rounded-full"
              style={{
                height: `${progress}%`,
                background: 'linear-gradient(180deg, #9b7bf7, #7c5fe0)',
                transition: 'height 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 0 6px rgba(155,123,247,0.5)',
              }}
            />
          </div>

          <ul className="flex-1 space-y-1.5">
            {headings.map((h) => {
              const level = h.props?.level || 1;
              const text = h.content.map((c) => c.text || '').join('');
              const isActive = h.id === activeId;
              return (
                <li
                  key={h.id}
                  className="text-[13px] cursor-pointer"
                  style={{
                    paddingLeft: `${(level - 1) * 16}px`,
                    color: isActive ? '#b69aff' : '#9b7bf7',
                    fontWeight: isActive ? 600 : 400,
                    transform: isActive ? 'translateX(2px)' : 'translateX(0)',
                    transition: 'color 0.2s, font-weight 0.2s, transform 0.2s',
                  }}
                  onClick={() => goTo(h.id)}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#b69aff'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#9b7bf7'; }}
                >
                  {text}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export const TableOfContents = createReactBlockSpec(
  {
    type: 'tableOfContents',
    propSchema: {},
    content: 'none',
  },
  {
    render: ({ editor }) => <TocView editor={editor} />,
  }
);
