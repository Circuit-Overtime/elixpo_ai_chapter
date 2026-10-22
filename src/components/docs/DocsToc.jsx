'use client';

import { useEffect, useState } from 'react';

export default function DocsToc({ headings }) {
  const [activeId, setActiveId] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!headings.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headings]);

  if (!headings.length) return <aside className="hidden lg:block w-48 flex-shrink-0" />;

  const activeHeading = headings.find((h) => h.id === activeId);

  return (
    <>
      {/* Mobile Compact TOC Control */}
      <div className="block lg:hidden mb-6 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-lg p-1"
          aria-expanded={isOpen}
          aria-label="Toggle Table of Contents"
        >
          <span className="flex items-center gap-2 truncate">
            <span className="text-[var(--text-muted)] font-normal">On this page:</span>
            <span className="text-[var(--accent)] truncate font-medium">
              {activeHeading ? activeHeading.text : 'Select section'}
            </span>
          </span>
          <span
            className="text-xs text-[var(--text-muted)] transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▼
          </span>
        </button>

        {isOpen && (
          <ul className="mt-3 pt-3 space-y-2 border-t border-[var(--border-default)]">
            {headings.map((h) => (
              <li key={h.id} style={{ paddingLeft: h.level === 3 ? '1rem' : '0' }}>
                <a
                  href={`#${h.id}`}
                  onClick={() => setIsOpen(false)}
                  className="block text-[13px] transition-colors hover:text-[var(--accent)] focus:outline-none focus:underline"
                  style={{
                    color: activeId === h.id ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: activeId === h.id ? 600 : 400,
                  }}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop Sticky Sidebar TOC */}
      <aside className="hidden lg:block w-48 flex-shrink-0 sticky top-20 self-start pl-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
          On this page
        </h4>
        <ul className="space-y-1.5 border-l" style={{ borderColor: 'var(--border-default)' }}>
          {headings.map((h) => (
            <li key={h.id} style={{ paddingLeft: h.level === 3 ? '1.5rem' : '0.75rem' }}>
              <a
                href={`#${h.id}`}
                className="block text-[12.5px] leading-snug transition-colors focus:outline-none focus:text-[var(--accent)]"
                style={{
                  color: activeId === h.id ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: activeId === h.id ? 600 : 400,
                }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
