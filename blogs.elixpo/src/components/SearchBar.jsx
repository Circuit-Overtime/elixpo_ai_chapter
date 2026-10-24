'use client';

import { useState, useEffect, useRef, useCallback, useId, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * The site search box: live suggestions + results, recent-history, and Enter to open
 * the full results page.
 *
 * Extracted so the feed and /search share one implementation. They previously had a
 * rich dropdown and a plain input respectively, which meant suggestions and history
 * only existed on the feed.
 *
 * @param defaultQuery  seed value (the /search page passes ?q= so the box reflects the URL)
 * @param autoFocus     focus on mount
 * @param compact       slightly tighter padding for the feed header
 */
export default function SearchBar({ defaultQuery = '', autoFocus = false, compact = false }) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState({ users: [], orgs: [], blogs: [] });
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const listboxId = useId();
  const router = useRouter();

  // Keep in sync when the URL changes underneath us (back/forward on /search).
  useEffect(() => { setQuery(defaultQuery); }, [defaultQuery]);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Global '/' shortcut focuses the search bar unless typing in an editable field.
  useEffect(() => {
    function handleGlobalKeyDown(e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const loadSuggestions = useCallback((prefix = '') => {
    fetch(`/api/search/suggestions${prefix ? `?q=${encodeURIComponent(prefix)}` : ''}`)
      .then(r => r.json())
      .then(d => setSuggestions(d.suggestions || []))
      .catch(() => {});
  }, []);

  // Empty/short query → history + topic suggestions. Longer → live results too.
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults({ users: [], orgs: [], blogs: [] });
      if (query.length === 0) loadSuggestions();
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(query)}&scope=all`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`).then(r => r.json()).catch(() => ({ suggestions: [] })),
      ]).then(([searchData, sugData]) => {
        setResults({ users: searchData.users || [], orgs: searchData.orgs || [], blogs: searchData.blogs || [] });
        setSuggestions(sugData.suggestions || []);
        setLoading(false);
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [query, loadSuggestions]);

  const recordSearch = (q) => {
    fetch('/api/search/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    }).catch(() => {});
  };

  const handleSelect = (type, item) => {
    setOpen(false);
    recordSearch(query);
    if (type === 'user') router.push(`/${item.username}`);
    else if (type === 'org') router.push(`/${item.slug}`);
    else if (type === 'blog') router.push(`/${item.author_username || 'blog'}/${item.slug}`);
    else if (type === 'suggestion') { setQuery(item.query); setOpen(true); }
    if (type !== 'suggestion') setQuery('');
  };

  // Enter = "show me everything", not just the dropdown's top few. The query goes in
  // the URL so results stay linkable and survive a refresh.
  const submitSearch = (q = query) => {
    const next = (q || '').trim();
    if (!next) return;
    setOpen(false);
    recordSearch(next);
    router.push(`/search?q=${encodeURIComponent(next)}`);
  };

  // Search history is personal data collected silently — offer a way out of it.
  const clearHistory = async (e) => {
    e.stopPropagation();
    setClearing(true);
    try {
      await fetch('/api/search/suggestions', { method: 'DELETE' });
      setSuggestions(s => s.filter(x => x.type !== 'recent'));
    } catch {}
    setClearing(false);
  };

  const forgetOne = async (e, q) => {
    e.stopPropagation();
    try {
      await fetch(`/api/search/suggestions?q=${encodeURIComponent(q)}`, { method: 'DELETE' });
      setSuggestions(s => s.filter(x => !(x.type === 'recent' && x.query === q)));
    } catch {}
  };

  const hasResults = results.users.length > 0 || results.orgs.length > 0 || results.blogs.length > 0;
  const recents = suggestions.filter(s => s.type === 'recent');
  const topics = suggestions.filter(s => s.type !== 'recent');
  const showPanel = open && (hasResults || suggestions.length > 0 || loading || query.trim().length >= 2);

  // Flattened list of visible entries for keyboard navigation
  const options = useMemo(() => {
    if (!showPanel) return [];
    const list = [];
    if (!hasResults) {
      recents.forEach(s => list.push({ type: 'suggestion', item: s }));
      topics.forEach(s => list.push({ type: 'suggestion', item: s }));
    } else {
      results.blogs.forEach(b => list.push({ type: 'blog', item: b }));
      results.users.forEach(u => list.push({ type: 'user', item: u }));
      results.orgs.forEach(o => list.push({ type: 'org', item: o }));
    }
    if (query.trim().length >= 2) list.push({ type: 'all' });
    return list;
  }, [showPanel, hasResults, recents, topics, results, query]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query, results, suggestions, open]);

  const listRef = useRef(null);
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      activeEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleKeyDown = (e) => {
    if (!showPanel || options.length === 0) {
      if (e.key === 'Enter') { e.preventDefault(); submitSearch(); }
      else if (e.key === 'Escape') setOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i === -1 ? options.length - 1 : Math.max(-1, i - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) {
        const sel = options[activeIndex];
        if (sel.type === 'all') submitSearch();
        else handleSelect(sel.type, sel.item);
      } else {
        submitSearch();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  const recentsOffset = 0;
  const topicsOffset = recents.length;
  const blogsOffset = 0;
  const usersOffset = results.blogs.length;
  const orgsOffset = usersOffset + results.users.length;
  const allIndex = options.length - 1;

  return (
    <div className="relative" ref={ref}>
      <div
        className={`flex items-center gap-2 rounded-xl px-4 transition-colors ${compact ? 'py-2.5' : 'py-3'}`}
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
      >
        <ion-icon name="search-outline" style={{ fontSize: '16px', color: 'var(--text-faint)' }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          placeholder="Search blogs, people, topics... or try tag:hacktoberfest"
          autoFocus={autoFocus}
          className="flex-1 bg-transparent outline-none text-[14px] min-w-0"
          style={{ color: 'var(--text-primary)' }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(true); }} className="flex items-center justify-center w-6 h-6 rounded-full transition-colors flex-shrink-0" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }} title="Clear">
            <ion-icon name="close" style={{ fontSize: '14px' }} />
          </button>
        )}
        <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-faint)', border: '1px solid var(--border-default)' }}>
          /
        </kbd>
      </div>

      {showPanel && (
        <div id={listboxId} ref={listRef} role="listbox" className="absolute left-0 right-0 top-full mt-2 rounded-xl shadow-xl z-50 overflow-hidden max-h-[440px] overflow-y-auto" style={{ backgroundColor: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)' }}>

          {/* Recent searches — with per-item forget and a clear-all */}
          {!hasResults && recents.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-3 pt-1 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Recent</span>
                <button
                  onClick={clearHistory}
                  disabled={clearing}
                  className="text-[10px] font-medium transition-colors disabled:opacity-50"
                  style={{ color: 'var(--text-faint)' }}
                >
                  {clearing ? 'Clearing…' : 'Clear history'}
                </button>
              </div>
              {recents.map((s, i) => {
                const index = recentsOffset + i;
                const active = activeIndex === index;
                return (
                  <div
                    key={`r${i}`}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onClick={() => handleSelect('suggestion', s)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg transition-colors text-[13px] cursor-pointer group"
                    style={{
                      color: 'var(--text-secondary)',
                      backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
                    }}
                  >
                    <ion-icon name="time-outline" style={{ fontSize: '14px', color: 'var(--text-faint)' }} />
                    <span className="truncate">{s.query}</span>
                    <button
                      onClick={(e) => forgetOne(e, s.query)}
                      className="ml-auto flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
                      style={{ color: 'var(--text-faint)' }}
                      title="Remove from history"
                    >
                      <ion-icon name="close" style={{ fontSize: '12px' }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Topic suggestions */}
          {!hasResults && topics.length > 0 && (
            <div className="p-2 pt-0">
              {topics.map((s, i) => {
                const index = topicsOffset + i;
                const active = activeIndex === index;
                return (
                  <button
                    key={`t${i}`}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onClick={() => handleSelect('suggestion', s)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg transition-colors text-[13px]"
                    style={{
                      color: 'var(--text-secondary)',
                      backgroundColor: active ? 'var(--bg-hover)' : 'transparent',
                    }}
                  >
                    <ion-icon name="pricetag-outline" style={{ fontSize: '14px', color: 'var(--text-faint)' }} />
                    {s.query}
                    <span className="ml-auto text-[10px]" style={{ color: 'var(--text-faint)' }}>Topic</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Live results */}
          {results.blogs.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Blogs</p>
              {results.blogs.map((b, i) => {
                const index = blogsOffset + i;
                const active = activeIndex === index;
                return (
                  <button
                    key={b.slugid || b.id}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onClick={() => handleSelect('blog', b)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ backgroundColor: active ? 'var(--bg-hover)' : 'transparent' }}
                  >
                    <ion-icon name="document-text-outline" style={{ fontSize: '16px', color: 'var(--text-faint)' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.title || 'Untitled'}</p>
                      {b.author_username && <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>by @{b.author_username}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {results.users.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>People</p>
              {results.users.map((u, i) => {
                const index = usersOffset + i;
                const active = activeIndex === index;
                return (
                  <button
                    key={u.id}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onClick={() => handleSelect('user', u)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ backgroundColor: active ? 'var(--bg-hover)' : 'transparent' }}
                  >
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                      : <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>{(u.display_name || u.username || '?')[0].toUpperCase()}</div>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{u.display_name || u.username}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>@{u.username}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {results.orgs.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Organizations</p>
              {results.orgs.map((o, i) => {
                const index = orgsOffset + i;
                const active = activeIndex === index;
                return (
                  <button
                    key={o.id}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onClick={() => handleSelect('org', o)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ backgroundColor: active ? 'var(--bg-hover)' : 'transparent' }}
                  >
                    <ion-icon name="people-outline" style={{ fontSize: '16px', color: 'var(--text-faint)' }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{o.name}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>@{o.slug}{o.tagline ? ` · ${o.tagline}` : ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {loading && !hasResults && suggestions.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>Searching...</div>
          )}
          {!loading && query.length >= 2 && !hasResults && suggestions.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>No results for "{query}"</div>
          )}

          {/* Footer: full results + the syntax reference. Qualifiers are invisible
              unless we point at them, so the docs link lives where people search. */}
          <div style={{ borderTop: '1px solid var(--dropdown-border)' }}>
            {query.trim().length >= 2 && (
              <button
                id={`${listboxId}-option-${allIndex}`}
                role="option"
                aria-selected={activeIndex === allIndex}
                data-active={activeIndex === allIndex}
                onClick={() => submitSearch()}
                onMouseEnter={() => setActiveIndex(allIndex)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors"
                style={{ backgroundColor: activeIndex === allIndex ? 'var(--bg-hover)' : 'transparent' }}
              >
                <span className="text-[13px] font-medium truncate" style={{ color: 'var(--accent)' }}>
                  See all results for “{query.trim()}”
                </span>
                <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-faint)', border: '1px solid var(--border-default)' }}>
                  Enter
                </kbd>
              </button>
            )}
            <Link
              href="/docs/search"
              className="w-full flex items-center gap-2 px-4 py-2 text-[11px] transition-colors"
              style={{ color: 'var(--text-faint)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <ion-icon name="help-circle-outline" style={{ fontSize: '13px' }} />
              Search syntax: use
              <code className="font-mono" style={{ color: 'var(--text-muted)' }}>tag:</code>
              <code className="font-mono" style={{ color: 'var(--text-muted)' }}>author:</code>
              <code className="font-mono" style={{ color: 'var(--text-muted)' }}>sort:</code>
              to narrow results
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
