'use client';

import { createReactBlockSpec } from '@blocknote/react';
import { useState, useRef, useEffect, useCallback } from 'react';

export const TabsBlock = createReactBlockSpec(
  {
    type: 'tabsBlock',
    propSchema: {
      tabs: { default: '[]' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      let tabs = [];
      try { tabs = JSON.parse(block.props.tabs); } catch {}

      const [adding, setAdding] = useState(tabs.length === 0);
      const [newPageName, setNewPageName] = useState('');
      const [creating, setCreating] = useState(false);
      const inputRef = useRef(null);
      const wrapperRef = useRef(null);

      useEffect(() => {
        if (adding && inputRef.current) inputRef.current.focus();
        if (!adding && tabs.length === 0 && wrapperRef.current) wrapperRef.current.focus();
      }, [adding, tabs.length]);

      // Sync subpage titles from DB on mount
      useEffect(() => {
        if (tabs.length === 0) return;
        const blogId = getBlogId();
        if (!blogId) return;
        fetch(`/api/subpages?blogId=${blogId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data?.subpages) return;
            const titleMap = {};
            data.subpages.forEach(sp => { titleMap[sp.id] = sp.title; });
            let changed = false;
            const updated = tabs.map(t => {
              if (t.subpageId && titleMap[t.subpageId] && titleMap[t.subpageId] !== t.title) {
                changed = true;
                return { ...t, title: titleMap[t.subpageId] };
              }
              return t;
            });
            if (changed) editor.updateBlock(block, { props: { tabs: JSON.stringify(updated) } });
          })
          .catch(() => {});
      }, []);

      const getBlogId = () => {
        const m = window.location.pathname.match(/\/edit\/([^/]+)/);
        return m?.[1] || '';
      };

      const addPage = useCallback(async () => {
        const name = newPageName.trim() || 'Untitled Page';
        setCreating(true);
        try {
          const blogId = getBlogId();
          const res = await fetch('/api/subpages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blogId, title: name }),
          });
          if (res.ok) {
            const data = await res.json();
            const updated = [...tabs, { title: name, subpageId: data.id }];
            editor.updateBlock(block, { props: { tabs: JSON.stringify(updated) } });
            setNewPageName('');
            setAdding(false);
          }
        } catch {}
        setCreating(false);
      }, [newPageName, tabs, editor, block]);

      const removePage = useCallback(async (idx) => {
        const tab = tabs[idx];
        if (tab?.subpageId) {
          try { await fetch(`/api/subpages?id=${tab.subpageId}`, { method: 'DELETE' }); } catch {}
        }
        const updated = tabs.filter((_, i) => i !== idx);
        editor.updateBlock(block, { props: { tabs: JSON.stringify(updated) } });
      }, [tabs, editor, block]);

      const openSubpage = useCallback((tab) => {
        if (!tab.subpageId) return;
        const blogId = getBlogId();
        window.open(`/edit/${blogId}/${tab.subpageId}`, '_blank');
      }, []);

      const handleBlockKeyDown = (e) => {
        if ((e.key === 'Backspace' || e.key === 'Delete') && tabs.length === 0 && !adding) {
          e.preventDefault();
          e.stopPropagation();
          try { editor.removeBlocks([block.id]); } catch {}
        }
      };

      // --- Adding state: name input ---
      if (adding) {
        return (
          <div ref={wrapperRef} className="subpage-block" contentEditable={false} tabIndex={0} onKeyDown={handleBlockKeyDown} style={{ outline: 'none' }}>
            <div className="subpage-block-inner subpage-block-adding">
              <div className="subpage-icon subpage-icon--add">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9b7bf7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </div>
              <input
                ref={inputRef}
                value={newPageName}
                onChange={(e) => setNewPageName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && newPageName.trim() && !creating) { e.preventDefault(); addPage(); }
                  if (e.key === 'Backspace' && !newPageName) {
                    e.preventDefault();
                    if (tabs.length === 0) { try { editor.removeBlocks([block.id]); } catch {} }
                    else setAdding(false);
                  }
                  if (e.key === 'Escape') {
                    if (tabs.length === 0) { try { editor.removeBlocks([block.id]); } catch {} }
                    else setAdding(false);
                  }
                }}
                onKeyUp={(e) => e.stopPropagation()}
                disabled={creating}
                autoFocus
                placeholder="Sub-page name..."
                className="subpage-name-input"
              />
              {creating ? (
                <div className="w-4 h-4 border-2 border-[#9b7bf7] border-t-transparent rounded-full animate-spin" />
              ) : (
                <button onClick={addPage} disabled={!newPageName.trim()} className="subpage-create-btn">Create</button>
              )}
            </div>
          </div>
        );
      }

      // --- Rendered state: list of subpages ---
      return (
        <div ref={wrapperRef} className="subpage-block" contentEditable={false} tabIndex={0} onKeyDown={handleBlockKeyDown} style={{ outline: 'none' }}>
          {tabs.map((tab, i) => (
            <div
              key={tab.subpageId || i}
              className="subpage-block-inner subpage-item group/page"
              onClick={() => openSubpage(tab)}
            >
              <div className="subpage-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <line x1="10" y1="9" x2="8" y2="9"/>
                </svg>
              </div>
              <span className="subpage-title">{tab.title}</span>
              {/* Delete — hover only */}
              <button
                onClick={(e) => { e.stopPropagation(); removePage(i); }}
                className="subpage-delete-btn"
                title="Remove sub-page"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="subpage-arrow">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          ))}
        </div>
      );
    },
  }
);
