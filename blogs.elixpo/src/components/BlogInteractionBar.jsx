'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { rememberReadingProgress } from '../utils/readingProgress';

/**
 * BlogInteractionBar — renders at the bottom of a blog post.
 * Handles: view recording, read progress, likes, claps, bookmarks, share.
 * Also reports dwell time as a taste signal.
 */
export default function BlogInteractionBar({ blogId, blogTitle, blogAuthorId, canRepost = false, dotsMenu = null }) {
  const { user } = useAuth();
  const [interactions, setInteractions] = useState(null);
  const [clapAnim, setClapAnim] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(0);
  const [toast, setToast] = useState('');
  const flashToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  // Shared auth guard: redirects guests to the sign-in page with the current
  // path preserved as `?next=…` so they can return after signing in.
  const requireAuth = () => {
    if (user) return true;
    const next = typeof window !== 'undefined' ? encodeURIComponent(window.location.pathname) : '/';
    window.location.href = `/sign-in?next=${next}`;
    return false;
  };

  // Repost state — always fetch the count (shown even on your own blog).
  useEffect(() => {
    if (!blogId) return;
    fetch(`/api/blogs/${blogId}/repost`).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return; setReposted(!!d.reposted); setRepostCount(d.count || 0);
    }).catch(() => {});
  }, [blogId]);

  const toggleRepost = () => {
    if (!canRepost) return;
    if (!requireAuth()) return;
    const was = reposted;
    setReposted(!was); setRepostCount(c => c + (was ? -1 : 1));
    fetch(`/api/blogs/${blogId}/repost`, { method: was ? 'DELETE' : 'POST' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setReposted(!!d.reposted); setRepostCount(d.count || 0); if (!was) flashToast('Reposted to your followers'); })
      .catch(() => { setReposted(was); setRepostCount(c => c + (was ? 1 : -1)); });
  };
  const startTime = useRef(Date.now());
  const progressReported = useRef(0);

  // Fetch interaction state
  useEffect(() => {
    if (!blogId) return;
    fetch(`/api/blogs/${blogId}/interactions`)
      .then(r => r.json())
      .then(setInteractions)
      .catch(() => {});
  }, [blogId]);

  // Record view on mount
  useEffect(() => {
    if (!blogId) return;
    const params = new URLSearchParams(window.location.search);
    fetch(`/api/blogs/${blogId}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referrer: document.referrer,
        utmSource: params.get('utm_source'),
        utmMedium: params.get('utm_medium'),
        utmCampaign: params.get('utm_campaign'),
      }),
    }).catch(() => {});
  }, [blogId]);

  // Track scroll progress for signed-in and anonymous readers. Anonymous
  // sessions use the privacy-safe analytics endpoint instead of read history.
  useEffect(() => {
    if (!blogId) return;

    const sendProgress = (progress, dwellSeconds = 0, beacon = false) => {
      rememberReadingProgress({ blogId, title: blogTitle, url: window.location.pathname, progress, readerKey: user?.id || 'guest' });
      const complete = progress >= 0.9;
      const url = user ? `/api/blogs/${blogId}/progress` : '/api/analytics/event';
      const body = user
        ? { progress, dwellSeconds }
        : { blogId, eventType: complete ? 'read_complete' : 'read_progress', value: complete ? dwellSeconds : progress };
      if (beacon) {
        try { navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: 'application/json' })); } catch {}
        return;
      }
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
    };

    const reportProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const progress = Math.min(1, Math.max(0, scrollTop / docHeight));

      // Only report if progress increased by at least 10%
      if (progress - progressReported.current >= 0.1) {
        progressReported.current = progress;
        sendProgress(Math.round(progress * 100) / 100);
      }
    };

    const interval = setInterval(reportProgress, 5000);
    window.addEventListener('scroll', reportProgress, { passive: true });

    // Report dwell time on unmount
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', reportProgress);
      const dwellSeconds = Math.floor((Date.now() - startTime.current) / 1000);
      // A revisit that never scrolls must not erase the position from the
      // previous session. Explicit "Start over" uses the reset endpoint.
      if (dwellSeconds > 10 && progressReported.current >= 0.02) {
        sendProgress(progressReported.current, dwellSeconds, true);
      }
    };
  }, [blogId, blogTitle, user]);

  const [likeAnim, setLikeAnim] = useState(false);

  // Interactions are optimistic: update the UI instantly, write to the DB in the
  // background, reconcile with the server's authoritative count, and revert on failure.
  const toggleLike = () => {
    if (!requireAuth()) return;
    setLikeAnim(true);
    setTimeout(() => setLikeAnim(false), 400);
    setInteractions(prev => {
      if (!prev) return prev;
      const liked = !prev.liked;
      return { ...prev, liked, likeCount: Math.max(0, (prev.likeCount || 0) + (liked ? 1 : -1)) };
    });
    fetch(`/api/blogs/${blogId}/like`, { method: 'POST' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setInteractions(prev => prev ? { ...prev, liked: data.liked, likeCount: data.count } : prev))
      .catch(() => setInteractions(prev => {
        if (!prev) return prev;
        const liked = !prev.liked; // undo the optimistic toggle
        return { ...prev, liked, likeCount: Math.max(0, (prev.likeCount || 0) + (liked ? 1 : -1)) };
      }));
  };

  const addClap = () => {
    if (!requireAuth()) return;
    setClapAnim(true);
    setTimeout(() => setClapAnim(false), 300);
    setInteractions(prev => prev ? { ...prev, userClaps: (prev.userClaps || 0) + 1, totalClaps: (prev.totalClaps || 0) + 1 } : prev);
    fetch(`/api/blogs/${blogId}/clap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1 }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => setInteractions(prev => prev ? { ...prev, userClaps: data.userClaps, totalClaps: data.totalClaps } : prev))
      .catch(() => setInteractions(prev => prev ? { ...prev, userClaps: Math.max(0, (prev.userClaps || 0) - 1), totalClaps: Math.max(0, (prev.totalClaps || 0) - 1) } : prev));
  };

  const toggleBookmark = () => {
    if (!requireAuth()) return;
    const wasBookmarked = !!interactions?.bookmarked;
    setInteractions(prev => prev ? { ...prev, bookmarked: !wasBookmarked } : prev);
    const req = wasBookmarked
      ? fetch(`/api/library/bookmarks/${blogId}`, { method: 'DELETE' })
      : fetch('/api/library/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogId }),
        });
    req.then(r => { if (!r.ok) throw new Error(); })
      .catch(() => setInteractions(prev => prev ? { ...prev, bookmarked: wasBookmarked } : prev));
  };

  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef(null);
  const [curateOpen, setCurateOpen] = useState(false);
  const [curatedCollections, setCuratedCollections] = useState([]);
  const [curateBusy, setCurateBusy] = useState('');
  const [curateError, setCurateError] = useState('');

  const openCurator = async () => {
    if (!requireAuth()) return;
    setCurateOpen(true);
    setCurateError('');
    try {
      const response = await fetch('/api/library/collections');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Collections could not be loaded');
      setCuratedCollections((data.collections || []).filter(collection => !collection.isDefault));
    } catch (error) {
      setCurateError(error.message);
    }
  };

  const curateBlog = async (collection) => {
    setCurateBusy(collection.id);
    setCurateError('');
    try {
      const response = await fetch(`/api/library/collections/${encodeURIComponent(collection.id)}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The post could not be added');
      setCurateOpen(false);
      flashToast(`Added to ${collection.name}`);
    } catch (error) {
      setCurateError(error.message);
    } finally {
      setCurateBusy('');
    }
  };

  useEffect(() => {
    if (!shareOpen) return;
    const handleClick = (e) => { if (shareRef.current && !shareRef.current.contains(e.target)) setShareOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [shareOpen]);

  useEffect(() => {
    if (!curateOpen) return;
    const close = (event) => { if (event.key === 'Escape') setCurateOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [curateOpen]);

  // ── Report ──
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const reportRef = useRef(null);
  useEffect(() => {
    if (!reportOpen) return;
    const h = (e) => { if (reportRef.current && !reportRef.current.contains(e.target)) setReportOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [reportOpen]);
  const REPORT_REASONS = [
    ['spam', 'Spam'],
    ['harassment', 'Harassment or hate'],
    ['nsfw', 'Adult / NSFW'],
    ['copyright', 'Copyright violation'],
    ['misinfo', 'Misinformation'],
    ['other', 'Something else'],
  ];
  const submitReport = async (reason) => {
    setReportOpen(false);
    if (!requireAuth()) return;
    try {
      const res = await fetch(`/api/blogs/${blogId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) setReported(true);
    } catch {}
  };

  const copyLink = () => {
    trackShare('link');
    navigator.clipboard.writeText(window.location.href).catch(() => {});
    setShareOpen(false);
  };

  const copyEmbed = () => {
    trackShare('embed');
    const url = window.location.href;
    const code = `<iframe src="${url}?embed=1" width="100%" height="600" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(code).catch(() => {});
    setShareOpen(false);
  };

  const copyMarkdown = () => {
    trackShare('markdown');
    const url = window.location.href;
    const md = `[${document.title || 'Blog post'}](${url})`;
    navigator.clipboard.writeText(md).catch(() => {});
    setShareOpen(false);
  };

  const trackShare = (method) => {
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blogId, eventType: 'share', method }),
      keepalive: true,
    }).catch(() => {});
  };

  if (!interactions) return null;

  const fmt = (n) => {
    if (!n) return '0';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="flex items-center justify-between gap-x-1 gap-y-1 flex-wrap py-1">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-app)', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
          <ion-icon name="checkmark-circle" style={{ fontSize: '15px' }} /> {toast}
        </div>
      )}
      {curateOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onMouseDown={(event) => event.target === event.currentTarget && setCurateOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl p-5 shadow-2xl" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>Add to a collection</h3>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>The original author and license stay attached.</p>
              </div>
              <button onClick={() => setCurateOpen(false)} className="p-2" title="Close" style={{ color: 'var(--text-muted)' }}><ion-icon name="close-outline" /></button>
            </div>
            {curateError && <p className="text-[12px] text-red-500 mb-3">{curateError}</p>}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {curatedCollections.map(collection => (
                <button key={collection.id} onClick={() => curateBlog(collection)} disabled={!!curateBusy} className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left disabled:opacity-60" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                  <ion-icon name="albums-outline" style={{ fontSize: '18px', color: 'var(--accent)' }} />
                  <span className="flex-1 min-w-0 truncate text-[13px] font-medium">{collection.name}</span>
                  {curateBusy === collection.id && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Adding…</span>}
                </button>
              ))}
              {!curatedCollections.length && !curateError && <p className="text-[13px] py-5 text-center" style={{ color: 'var(--text-muted)' }}>Create a collection in your Library first.</p>}
            </div>
            <a href="/library" className="block text-center text-[12px] mt-4" style={{ color: 'var(--accent)' }}>Manage collections</a>
          </div>
        </div>
      )}
      {/* Left — engagement actions */}
      <div className="flex items-center gap-1">
        {/* Like */}
        <button
          onClick={toggleLike}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium"
          style={{
            color: interactions.liked ? '#f87171' : 'var(--text-muted)',
            backgroundColor: interactions.liked ? '#f8717110' : 'transparent',
            transform: likeAnim ? 'scale(1.25)' : 'scale(1)',
            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s, background-color 0.15s',
          }}
          title={interactions.liked ? 'Unlike' : 'Like'}
        >
          <ion-icon name={interactions.liked ? 'heart' : 'heart-outline'} style={{ fontSize: '18px' }} />
          {interactions.likeCount > 0 && <span>{fmt(interactions.likeCount)}</span>}
        </button>

        {/* Clap */}
        <button
          onClick={addClap}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium"
          style={{
            color: interactions.userClaps > 0 ? '#9b7bf7' : 'var(--text-muted)',
            backgroundColor: interactions.userClaps > 0 ? '#9b7bf710' : 'transparent',
            transform: clapAnim ? 'scale(1.3) rotate(-8deg)' : 'scale(1) rotate(0deg)',
            transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s, background-color 0.15s',
          }}
          title={`Clap (${interactions.userClaps}/50)`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 11l4-8 1.5 2L17 3l-2 8h4l-8 13 1-6H7z"/>
          </svg>
          {interactions.totalClaps > 0 && <span>{fmt(interactions.totalClaps)}</span>}
        </button>

        {/* Comments count */}
        <div className="flex items-center gap-1.5 px-3 py-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          <ion-icon name="chatbubble-outline" style={{ fontSize: '17px' }} />
          {interactions.commentCount > 0 && <span>{fmt(interactions.commentCount)}</span>}
        </div>

        {/* Repost — greyed/disabled for the author and co-authors; count shows when > 0 */}
        <button
          onClick={toggleRepost}
          disabled={!canRepost}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-colors"
          style={{ color: reposted ? '#16a34a' : 'var(--text-muted)', backgroundColor: reposted ? '#16a34a14' : 'transparent', opacity: canRepost ? 1 : 0.4, cursor: canRepost ? 'pointer' : 'not-allowed' }}
          title={!canRepost ? "You can't repost your own blog" : (reposted ? 'Undo repost' : 'Repost to your followers')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          {repostCount > 0 && <span>{fmt(repostCount)}</span>}
        </button>
      </div>

      {/* Right — utility actions */}
      <div className="flex items-center gap-1">
        {/* Views */}
        <div className="flex items-center gap-1.5 px-3 py-2 text-[13px]" style={{ color: 'var(--text-faint)' }}>
          <ion-icon name="eye-outline" style={{ fontSize: '16px' }} />
          <span>{fmt(interactions.viewCount)}</span>
        </div>

        {/* Bookmark */}
        <button
          onClick={toggleBookmark}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all"
          style={{ color: interactions.bookmarked ? '#9b7bf7' : 'var(--text-muted)' }}
          title={interactions.bookmarked ? 'Remove from library' : 'Save to library'}
        >
          <ion-icon name={interactions.bookmarked ? 'bookmark' : 'bookmark-outline'} style={{ fontSize: '18px' }} />
        </button>

        <button
          onClick={openCurator}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all"
          style={{ color: 'var(--text-muted)' }}
          title="Add to a collection"
        >
          <ion-icon name="albums-outline" style={{ fontSize: '18px' }} />
        </button>

        {/* Share dropdown */}
        <div className="relative" ref={shareRef}>
          <button
            onClick={() => setShareOpen(!shareOpen)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all"
            style={{ color: 'var(--text-muted)' }}
            title="Share"
          >
            <ion-icon name="share-outline" style={{ fontSize: '18px' }} />
          </button>
          {shareOpen && (
            <div className="absolute bottom-full mb-2 right-0 w-[200px] rounded-xl shadow-xl z-50 overflow-hidden py-1" style={{ backgroundColor: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)' }}>
              <button onClick={copyLink} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors text-left" style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <ion-icon name="link-outline" style={{ fontSize: '16px', color: 'var(--text-faint)' }} />
                Copy link
              </button>
              <button onClick={copyEmbed} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors text-left" style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <ion-icon name="code-slash-outline" style={{ fontSize: '16px', color: 'var(--text-faint)' }} />
                Embed
              </button>
              <button onClick={copyMarkdown} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors text-left" style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <ion-icon name="document-text-outline" style={{ fontSize: '16px', color: 'var(--text-faint)' }} />
                Copy Markdown
              </button>
            </div>
          )}
        </div>

        {/* "..." menu (report lives inside it) — falls back to the legacy report
            dropdown when no dotsMenu is supplied. */}
        {dotsMenu ? dotsMenu : (
          <div className="relative" ref={reportRef}>
            <button
              onClick={() => !reported && setReportOpen(!reportOpen)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all"
              style={{ color: reported ? '#f87171' : 'var(--text-muted)' }}
              title={reported ? 'Reported' : 'Report this post'}
            >
              <ion-icon name={reported ? 'flag' : 'flag-outline'} style={{ fontSize: '17px' }} />
            </button>
            {reportOpen && !reported && (
              <div className="absolute bottom-full mb-2 right-0 w-[210px] rounded-xl shadow-xl z-50 overflow-hidden py-1" style={{ backgroundColor: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)' }}>
                <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Report for…</div>
                {REPORT_REASONS.map(([value, label]) => (
                  <button key={value} onClick={() => submitReport(value)} className="w-full flex items-center px-4 py-2 text-[13px] transition-colors text-left" style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
