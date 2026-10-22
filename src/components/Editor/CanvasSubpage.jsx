'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Configurable so we can point at a local sketch.elixpo dev server during
// development. Falls back to production. The matching origin is also used
// to gate postMessage events.
const EMBED_BASE = process.env.NEXT_PUBLIC_LIXSKETCH_EMBED_URL || 'https://sketch.elixpo.com';
let EMBED_ORIGIN = '*';
try { EMBED_ORIGIN = new URL(EMBED_BASE).origin; } catch {}

export default function CanvasSubpage({ slugid, subpageId, initialTitle, initialContent, initialMetadata }) {
  const router = useRouter();
  const iframeRef = useRef(null);
  const titleRef = useRef(initialTitle || 'Untitled Canvas');
  const lastSentJsonRef = useRef('');
  const lastSavedAtRef = useRef(null);

  const [title, setTitle] = useState(initialTitle || 'Untitled Canvas');
  const [editingTitle, setEditingTitle] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | dirty | syncing | synced | error
  const [iframeReady, setIframeReady] = useState(false);

  useEffect(() => { titleRef.current = title; }, [title]);

  const sendInit = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({
      type: 'lixsketch:init',
      subpageId,
      content: initialContent || null,
      metadata: initialMetadata || null,
      theme: 'dark',
    }, EMBED_ORIGIN);
  }, [subpageId, initialContent, initialMetadata]);

  // Handle messages from the canvas iframe
  useEffect(() => {
    async function handleUploadImageRequest(msg) {
      const post = (payload) => {
        const w = iframeRef.current?.contentWindow;
        if (!w) return;
        w.postMessage({ type: 'lixsketch:upload-image-result', ...payload }, EMBED_ORIGIN);
      };

      try {
        if (!msg.dataUrl || !msg.dataUrl.startsWith('data:')) {
          post({ requestId: msg.requestId, error: 'Invalid data URL' });
          return;
        }
        // dataUrl → Blob → File
        const m = msg.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) {
          post({ requestId: msg.requestId, error: 'Unsupported encoding' });
          return;
        }
        const mime = m[1] || 'image/png';
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const ext = (mime.split('/')[1] || 'png').split('+')[0];
        const file = new File([bytes], `${msg.filename || 'canvas_image'}.${ext}`, { type: mime });

        const fd = new FormData();
        fd.append('file', file);
        fd.append('blogId', slugid);
        fd.append('type', 'image');

        const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          post({ requestId: msg.requestId, error: data.error || `HTTP ${res.status}` });
          return;
        }
        const data = await res.json();
        post({
          requestId: msg.requestId,
          url: data.url,
          publicId: data.publicId,
          sizeBytes: data.sizeBytes,
        });
      } catch (err) {
        const w = iframeRef.current?.contentWindow;
        if (w) w.postMessage({ type: 'lixsketch:upload-image-result', requestId: msg.requestId, error: err.message }, EMBED_ORIGIN);
      }
    }

    function onMessage(e) {
      if (EMBED_ORIGIN !== '*' && e.origin !== EMBED_ORIGIN) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'lixsketch:ready') {
        setIframeReady(true);
        sendInit();
        return;
      }

      if (msg.type === 'lixsketch:dirty') {
        setSyncStatus('dirty');
        return;
      }

      if (msg.type === 'lixsketch:save') {
        const json = JSON.stringify(msg.content || {});
        if (json === lastSentJsonRef.current) return;
        lastSentJsonRef.current = json;
        setSyncStatus('syncing');
        fetch('/api/subpages', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: subpageId,
            content: msg.content,
            metadata: msg.metadata || null,
          }),
        })
          .then((r) => {
            if (r.ok) {
              setSyncStatus('synced');
              lastSavedAtRef.current = Date.now();
              setTimeout(() => setSyncStatus((s) => (s === 'synced' ? 'idle' : s)), 4000);
            } else {
              setSyncStatus('error');
            }
          })
          .catch(() => setSyncStatus('error'));
        return;
      }

      if (msg.type === 'lixsketch:upload-image') {
        handleUploadImageRequest(msg).catch(() => {});
        return;
      }

      if (msg.type === 'lixsketch:exit') {
        // Ask the iframe for one last save, then navigate back.
        const iframe = iframeRef.current;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'lixsketch:request-save' }, EMBED_ORIGIN);
        }
        setTimeout(() => router.push(`/edit/${slugid}`), 250);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [router, sendInit, slugid, subpageId]);

  const saveTitle = useCallback(async (newTitle) => {
    const t = (newTitle || '').trim() || 'Untitled Canvas';
    setTitle(t);
    setEditingTitle(false);
    try {
      await fetch('/api/subpages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: subpageId, title: t }),
      });
    } catch {}
  }, [subpageId]);

  const statusLabel = {
    idle: '',
    dirty: 'Editing…',
    syncing: 'Saving…',
    synced: 'Saved',
    error: 'Save failed',
  }[syncStatus];

  const statusDot = {
    dirty: 'bg-yellow-400',
    syncing: 'bg-yellow-400 animate-pulse',
    synced: 'bg-green-400',
    error: 'bg-red-400',
  }[syncStatus];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Slim header — matches the rest of the editor's chrome */}
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--border-default)] bg-[var(--bg-app)]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/edit/${slugid}`}
            className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="text-[13px] hidden sm:inline">Back to blog</span>
          </Link>
          <span className="text-[var(--text-faint)] text-sm">/</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9b7bf7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M3 3h18v18H3zM3 9h18M9 21V9" />
            </svg>
            {editingTitle ? (
              <input
                autoFocus
                defaultValue={title}
                onBlur={(e) => saveTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle(e.target.value);
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="text-[13px] font-medium bg-transparent outline-none border-b border-[#9b7bf7] text-[var(--text-primary)] w-48"
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
            <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md font-semibold" style={{ color: '#9b7bf7', backgroundColor: 'rgba(155,123,247,0.12)', border: '1px solid rgba(155,123,247,0.3)' }}>
              Canvas
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          {statusDot && <span className={`w-2 h-2 rounded-full ${statusDot}`} />}
          {statusLabel && <span>{statusLabel}</span>}
        </div>
      </header>

      {/* The canvas iframe owns the full remaining viewport. */}
      <div className="relative flex-1">
        {!iframeReady && (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)] text-sm gap-2">
            <div className="w-4 h-4 border-2 border-[#9b7bf7] border-t-transparent rounded-full animate-spin" />
            Loading canvas…
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={`${EMBED_BASE}/embed/canvas`}
          title="LixSketch canvas"
          className="absolute inset-0 w-full h-full border-0"
          // Allow the canvas to use clipboard, downloads, fullscreen — no top-nav.
          allow="clipboard-read; clipboard-write; fullscreen"
          // sandbox kept off for now — the canvas needs to use globals + workers
          // and we trust the sketch.elixpo origin. Tighten later if needed.
        />
      </div>
    </div>
  );
}
