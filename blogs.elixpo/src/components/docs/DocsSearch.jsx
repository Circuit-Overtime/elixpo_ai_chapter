'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { docsNavFlat } from '../../config/docsNav';

export default function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
    else setQuery('');
  }, [open]);

  const results = docsNavFlat.filter((item) => {
    const q = query.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px]"
        style={{ border: '1px solid var(--border-default)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface)' }}
      >
        <ion-icon name="search-outline" style={{ fontSize: '14px' }} />
        Search docs
        <kbd className="text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--border-default)' }}>⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs..."
          className="w-full px-4 py-3 text-[14px] outline-none bg-transparent"
          style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {results.map((item) => (
            <li key={item.slug}>
              <button
                onClick={() => {
                  router.push(`/docs/${item.slug}`);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-[13px] hover:bg-black/5"
                style={{ color: 'var(--text-primary)' }}
              >
                <div className="font-medium">{item.title}</div>
                <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{item.description}</div>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-3 text-[13px]" style={{ color: 'var(--text-muted)' }}>No results.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
