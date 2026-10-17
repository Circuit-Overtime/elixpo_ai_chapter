'use client';

import { use, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../../../../src/context/AuthContext';
import { useTheme } from '../../../../src/context/ThemeContext';
import { useCollaboration } from '../../../../src/hooks/useCollaboration';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import '../../../../src/styles/editor/editor.css';
import '../../../../src/styles/katex-fonts.css';

const BlockNoteEditor = dynamic(() => import('../../../../src/components/Editor/BlogEditor'), { ssr: false });
const BlogPreview = dynamic(() => import('../../../../src/components/Editor/BlogPreview'), { ssr: false });
const KeyboardShortcutsModal = dynamic(() => import('../../../../src/components/Editor/KeyboardShortcutsModal'), { ssr: false });
const CanvasSubpage = dynamic(() => import('../../../../src/components/Editor/CanvasSubpage'), { ssr: false });

const STORAGE_KEY_PREFIX = 'lixblogs_subpage_';

function getDraftKey(subpageId) {
  return STORAGE_KEY_PREFIX + subpageId;
}

function loadDraft(subpageId) {
  try {
    const raw = localStorage.getItem(getDraftKey(subpageId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(subpageId, data) {
  try {
    localStorage.setItem(getDraftKey(subpageId), JSON.stringify({
      ...data,
      savedAt: Date.now(),
    }));
  } catch { /* storage full */ }
}

export default function SubpageClient({ params }) {
  const { slugid, subpageId } = use(params);
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const editorRef = useRef(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState(null);
  const [kind, setKind] = useState('doc');
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | local
  const [lastSaved, setLastSaved] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [mode, setMode] = useState('edit'); // edit | preview
  const [previewBlocks, setPreviewBlocks] = useState([]);
  const [editorContent, setEditorContent] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [parentBlogId, setParentBlogId] = useState(null); // canonical parent blog id
  const [hasCollab, setHasCollab] = useState(false);

  // Live collaboration on this sub-page (same 5-editor cap as the main blog),
  // keyed by the canonical parent blog id + this sub-page id (#11 D).
  const {
    collaboration: collabConfig, isConnected: collabConnected, connectedUsers,
    roomFull, needsSeed, clearSeed,
  } = useCollaboration({
    blogId: parentBlogId,
    subpageId,
    user,
    enabled: kind === 'doc' && hasCollab && !!parentBlogId,
  });
  const hadUserGestureRef = useRef(false);
  const draftTimerRef = useRef(null);
  const titleInputRef = useRef(null);

  // Track user gesture so beforeunload dialog only fires after interaction
  useEffect(() => {
    const mark = () => { hadUserGestureRef.current = true; };
    window.addEventListener('keydown', mark, { once: true });
    window.addEventListener('pointerdown', mark, { once: true });
    return () => { window.removeEventListener('keydown', mark); window.removeEventListener('pointerdown', mark); };
  }, []);

  // Ref to always hold latest draft data (avoids stale closures in intervals/beforeunload)
  const draftDataRef = useRef({ title, editorContent });
  useEffect(() => {
    draftDataRef.current = { title, editorContent };
  }, [title, editorContent]);

  const formatSavedTime = (ts) => {
    if (!ts) return null;
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 10) return 'Just saved';
    if (diff < 60) return `Saved ${diff}s ago`;
    if (diff < 3600) return `Saved ${Math.floor(diff / 60)}m ago`;
    return `Saved ${Math.floor(diff / 3600)}h ago`;
  };

  // Fetch subpage data — check localStorage first, then cloud
  useEffect(() => {
    const localDraft = loadDraft(subpageId);

    fetch(`/api/subpages?id=${subpageId}`)
      .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error); }))
      .then(data => {
        const subpageKind = data.kind === 'canvas' ? 'canvas' : 'doc';
        setKind(subpageKind);
        setMetadata(data.metadata || null);
        setParentBlogId(data.blog_id || slugid);

        // Canvas subpages: store raw scene JSON on `content`, no localStorage
        // shadow-draft because the iframe owns autosave.
        if (subpageKind === 'canvas') {
          setTitle(data.title || 'Untitled Canvas');
          setContent(typeof data.content === 'string' && data.content
            ? (() => { try { return JSON.parse(data.content); } catch { return null; } })()
            : data.content || null);
          return;
        }

        let parsed;
        try { parsed = typeof data.content === 'string' ? JSON.parse(data.content) : data.content; } catch {}

        // Use local draft if it's newer than cloud
        if (localDraft && localDraft.savedAt && data.updated_at && localDraft.savedAt > data.updated_at * 1000) {
          setTitle(localDraft.title || data.title || 'Untitled');
          setContent(localDraft.editorContent?.length ? localDraft.editorContent : parsed?.length ? parsed : undefined);
        } else {
          setTitle(data.title || 'Untitled');
          setContent(parsed?.length ? parsed : undefined);
        }
      })
      .catch(() => {
        // Offline — try localStorage
        if (localDraft) {
          setTitle(localDraft.title || 'Untitled');
          setContent(localDraft.editorContent?.length ? localDraft.editorContent : undefined);
        } else {
          setContent(undefined);
        }
      })
      .finally(() => setLoading(false));
  }, [subpageId]);

  // Enable collab on this sub-page only when the parent blog has accepted
  // co-authors (mirrors the main editor's condition).
  useEffect(() => {
    if (!parentBlogId) return;
    fetch(`/api/blogs/invite?slugid=${encodeURIComponent(parentBlogId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setHasCollab((d?.collaborators || []).some(c => c.status === 'accepted')))
      .catch(() => {});
  }, [parentBlogId]);

  // Cloud sync function — saves localStorage first then pushes to cloud
  const syncToCloud = useCallback(async ({ showToast = false, silent = false } = {}) => {
    const data = draftDataRef.current;
    if (!data.title && !data.editorContent) return;

    // Always save to localStorage first
    saveDraft(subpageId, data);
    setLastSaved(Date.now());

    if (!silent) setSyncStatus('syncing');

    try {
      const payload = { id: subpageId };
      if (data.title) payload.title = data.title;
      if (data.editorContent) payload.content = data.editorContent;

      const res = await fetch('/api/subpages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setHasUnsavedEdits(false);
        if (!silent) {
          setSyncStatus('synced');
          if (showToast) {
            setShowSavedToast(true);
            setTimeout(() => setShowSavedToast(false), 3000);
          }
          setTimeout(() => setSyncStatus('idle'), 5000);
        }
      } else {
        if (!silent) {
          setSyncStatus('local');
          setTimeout(() => setSyncStatus('idle'), 5000);
        }
      }
    } catch {
      if (!silent) {
        setSyncStatus('local');
        setTimeout(() => setSyncStatus('idle'), 5000);
      }
    }
  }, [subpageId]);

  // Compute word count
  const computeWordCount = useCallback((blocks) => {
    if (!blocks) return 0;
    const count = (list) => (list || []).reduce((sum, b) => {
      const text = (b.content || []).map(c => c.text || '').join(' ');
      return sum + text.split(/\s+/).filter(Boolean).length + count(b.children);
    }, 0);
    return count(blocks);
  }, []);

  const handleEditorChange = useCallback(() => {
    if (!editorRef.current) return;
    try {
      const blocks = editorRef.current.getBlocks();
      setEditorContent(blocks);
      setWordCount(computeWordCount(blocks));
      setHasUnsavedEdits(true);
      // Debounce localStorage writes — serializing full content on every keystroke is expensive
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        saveDraft(subpageId, { title: draftDataRef.current.title, editorContent: blocks });
      }, 1000);
    } catch {}
  }, [computeWordCount, subpageId]);

  // Switch mode
  const switchMode = useCallback(async (newMode) => {
    if (newMode !== 'edit' && editorRef.current) {
      try {
        if (editorRef.current.getBlocks) {
          setPreviewBlocks(editorRef.current.getBlocks());
        }
      } catch {}
    }
    setMode(newMode);
  }, []);

  // Keyboard shortcuts — same as parent blog
  // Ctrl+S → save + sync, Ctrl+D → insert date, Ctrl+Shift+P → toggle preview
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        syncToCloud({ showToast: true });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        const editor = editorRef.current?.getEditor?.();
        if (editor) {
          try {
            editor.insertInlineContent([{ type: 'dateInline', props: { date: new Date().toISOString().split('T')[0] } }]);
          } catch {}
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        switchMode(mode === 'edit' ? 'preview' : 'edit');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [syncToCloud, switchMode, mode]);

  // Sync on page load (after data loads)
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => syncToCloud({ silent: true }), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, syncToCloud]);

  // Sync before page unload + save draft (fallback for hard browser close)
  useEffect(() => {
    function handleBeforeUnload(e) {
      const data = draftDataRef.current;
      if (data.title || data.editorContent) {
        saveDraft(subpageId, data);
        try {
          const payload = { id: subpageId };
          if (data.title) payload.title = data.title;
          if (data.editorContent) payload.content = data.editorContent;
          fetch('/api/subpages', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {});
        } catch {}
      }
      if (hasUnsavedEdits && hadUserGestureRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [subpageId, hasUnsavedEdits]);

  // Save title
  const saveTitle = useCallback(async (newTitle) => {
    const t = newTitle.trim() || 'Untitled';
    setTitle(t);
    setEditingTitle(false);
    setHasUnsavedEdits(true);
    saveDraft(subpageId, { ...draftDataRef.current, title: t });
    try {
      await fetch('/api/subpages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: subpageId, title: t }),
      });
    } catch {}
  }, [subpageId]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) titleInputRef.current.focus();
  }, [editingTitle]);

  const modeTabs = useMemo(() => [
    { key: 'edit', icon: 'create-outline', label: 'Edit' },
    { key: 'preview', icon: 'eye-outline', label: 'Preview' },
  ], []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#9b7bf7] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Canvas sub-pages render the iframe-based sketch editor instead of BlockNote.
  if (kind === 'canvas') {
    return (
      <CanvasSubpage
        slugid={slugid}
        subpageId={subpageId}
        initialTitle={title}
        initialContent={content}
        initialMetadata={metadata}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] edit-page">
      {/* Header */}
      <header className="seasonal-themed-header fixed top-0 left-0 w-full h-14 border-b border-[var(--border-default)] flex items-center justify-between px-5 bg-[var(--bg-app)]/95 backdrop-blur-md z-50">
        {/* Left: back + breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/edit/${slugid}`} className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span className="text-[13px] hidden sm:inline">Back to blog</span>
          </Link>
          <span className="text-[var(--text-faint)] text-sm">/</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9b7bf7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                defaultValue={title}
                onBlur={(e) => saveTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(e.target.value); if (e.key === 'Escape') setEditingTitle(false); }}
                className="text-[13px] font-medium bg-transparent outline-none border-b border-[#9b7bf7] text-[var(--text-primary)] w-40"
              />
            ) : (
              <span
                className="text-[13px] font-medium text-[var(--text-primary)] cursor-pointer hover:text-[#9b7bf7] transition-colors truncate"
                onClick={() => setEditingTitle(true)}
                title="Click to rename"
              >
                {title}
              </span>
            )}
          </div>
          {/* Draft badge + saved time + sync dot — matches parent page */}
          <span className="text-[var(--text-muted)] text-[11px] hidden md:flex items-center gap-1.5">
            <span className="text-[var(--text-faint)] px-1.5 py-0.5 rounded border border-[var(--border-default)] bg-[var(--bg-surface)] text-[10px] font-medium">
              {hasUnsavedEdits ? 'Unsaved' : 'Draft'}
            </span>
            {lastSaved && <span>{formatSavedTime(lastSaved)}</span>}
          </span>
          {/* Sync status dot */}
          {syncStatus !== 'idle' && (
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                syncStatus === 'syncing' ? 'bg-yellow-400 animate-pulse' :
                syncStatus === 'synced' ? 'bg-green-400' :
                syncStatus === 'local' ? 'bg-yellow-500' : ''
              }`}
              title={
                syncStatus === 'syncing' ? 'Syncing to cloud...' :
                syncStatus === 'synced' ? 'Saved to cloud' :
                syncStatus === 'local' ? 'Saved locally' : ''
              }
            />
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {/* Live collaborators on this sub-page (#11) */}
          {collabConnected && connectedUsers.length > 1 && (
            <div className="flex items-center -space-x-2 mr-1" title={`${connectedUsers.length} editing now`}>
              {connectedUsers.slice(0, 5).map((u, i) => (
                u.avatar ? (
                  <img key={u.id || i} src={u.avatar} alt={u.name} title={u.name} className="w-7 h-7 rounded-full object-cover" style={{ border: `2px solid ${u.color || '#9b7bf7'}`, boxShadow: '0 0 0 2px var(--bg-app)' }} />
                ) : (
                  <div key={u.id || i} title={u.name} className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: u.color || '#9b7bf7', border: '2px solid var(--bg-app)' }}>
                    {(u.name || '?')[0].toUpperCase()}
                  </div>
                )
              ))}
            </div>
          )}
          {/* Mode tabs */}
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-surface)' }}>
            {modeTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => switchMode(tab.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  color: mode === tab.key ? '#9b7bf7' : 'var(--text-muted)',
                  backgroundColor: mode === tab.key ? 'rgba(155,123,247,0.08)' : 'transparent',
                }}
              >
                <ion-icon name={tab.icon} style={{ fontSize: '14px' }} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-faint)' }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <ion-icon name={isDark ? 'sunny-outline' : 'moon-outline'} style={{ fontSize: '16px' }} />
          </button>

          {/* Shortcuts help */}
          <button
            onClick={() => setShowShortcuts(true)}
            className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors text-sm font-bold"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-faint)' }}
            title="Keyboard shortcuts"
          >
            ?
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="pt-14 flex justify-center editor-texture-bg">
        <div className="w-full max-w-[720px] px-6 py-8">
          {/* Title — shown in edit mode */}
          {mode === 'edit' && (
            <>
              <h1
                className="text-[1.8em] font-extrabold leading-tight mb-6 cursor-pointer hover:text-[#9b7bf7] transition-colors"
                style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}
                onClick={() => setEditingTitle(true)}
              >
                {title}
              </h1>

              {roomFull && (
                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/25 text-[13px] text-[#d97706]">
                  <ion-icon name="eye-outline" style={{ fontSize: '16px' }} />
                  This sub-page already has 5 live editors — you're viewing in read-only until a slot frees up.
                </div>
              )}
              {/* Editor — blogId passed so Cloudinary uploads go to the parent blog's folder */}
              <div className="min-h-[60vh] pb-[100px]">
                {!loading && (
                  <BlockNoteEditor
                    ref={editorRef}
                    onChange={handleEditorChange}
                    initialContent={content}
                    blogId={slugid}
                    collaboration={collabConfig}
                    editable={!roomFull}
                    onCollabSeeded={needsSeed ? clearSeed : undefined}
                  />
                )}
              </div>
            </>
          )}

          {/* Preview mode */}
          {mode === 'preview' && (
            <div className="blog-preview-fullwidth">
              <BlogPreview
                title={title}
                blocks={previewBlocks}
                user={user}
                wordCount={wordCount}
                tags={[]}
              />
            </div>
          )}
        </div>
      </main>

      {/* Keyboard shortcuts modal */}
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {/* Saved to cloud toast — matches parent page */}
      <AnimatePresence>
        {showSavedToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-green-500/20 bg-[var(--bg-surface)]/90 backdrop-blur-lg shadow-2xl"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-[13px] text-green-300 font-medium">Saved to cloud</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
