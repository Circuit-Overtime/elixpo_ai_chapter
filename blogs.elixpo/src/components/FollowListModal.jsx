'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// Modal listing a user's followers or following. Names link to their profile.
// props: username, type ('followers' | 'following'), onClose
export default function FollowListModal({ username, type, onClose }) {
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setItems(null);
    setQuery('');
    fetch(`/api/users/${encodeURIComponent(username)}/follow-list?type=${type}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => { if (active) setItems(d.items || []); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [username, type]);

  const title = type === 'following' ? 'Following' : 'Followers';

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      (it.name || '').toLowerCase().includes(q) || (it.handle || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col max-h-[80vh]"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
          <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
            {title}
            {items && <span className="ml-2 text-[13px] font-normal" style={{ color: 'var(--text-muted)' }}>{items.length}</span>}
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}`}
              autoFocus
              className="w-full bg-transparent outline-none text-[14px]"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items === null ? (
            <div className="p-5 space-y-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-[var(--bg-elevated)] animate-pulse rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-[13px] text-[var(--text-muted)] py-10">
              {query.trim()
                ? `No matches for "${query.trim()}"`
                : (type === 'following' ? 'Not following anyone yet.' : 'No followers yet.')}
            </p>
          ) : (
            <ul>
              {filtered.map((it, i) => (
                <li key={i}>
                  <Link
                    href={`/${it.handle}`}
                    onClick={onClose}
                    className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    {it.avatar ? (
                      <img src={it.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                        {(it.name || it.handle || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{it.name}</p>
                      <p className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>@{it.handle}{it.type === 'org' ? ' · org' : ''}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
