'use client';

import { useEffect, useRef, useState } from 'react';
import { normalizeWebEmbedUrl } from '../../../core/WebEmbedPolicy.js';
import useSketchStore, { TOOLS } from '../../store/useSketchStore.js';

export default function WebEmbedModal() {
  const [open, setOpen] = useState(false), [url, setUrl] = useState(''), [error, setError] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    const show = () => { setOpen(true); setError(''); requestAnimationFrame(() => inputRef.current?.focus()); };
    window.__showWebEmbedModal = show; window.addEventListener('lixsketch:open-web-embed', show);
    return () => { delete window.__showWebEmbedModal; window.removeEventListener('lixsketch:open-web-embed', show); };
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event) => {
      if (event.key === 'Escape') { setOpen(false); useSketchStore.getState().setActiveTool(TOOLS.SELECT); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);
  if (!open) return null;
  let requestedHostname = '';
  try { requestedHostname = new URL(url).hostname; } catch {}
  const whitelistRequestUrl = `https://github.com/elixpo/sketch.elixpo/issues/new?template=web-embed-whitelist.yml&title=${encodeURIComponent(`[Web embed whitelist] ${requestedHostname || 'New hostname'}`)}`;
  const submit = (e) => {
    e.preventDefault(); const normalized = normalizeWebEmbedUrl(url);
    if (!normalized) { setError('This site is not currently supported for web embeds.'); return; }
    window.__placeWebEmbed?.(normalized); setOpen(false); setUrl('');
  };
  return <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
    <form onSubmit={submit} className="w-full max-w-xl rounded-2xl border border-border-light bg-surface-card p-6 font-[lixFont] shadow-2xl">
      <div className="mb-5 flex justify-between"><div><h2 className="text-lg text-text-primary">Embed a website</h2><p className="mt-1 text-xs text-text-muted">One secure embed in a movable, resizable frame.</p></div><button type="button" onClick={() => { setOpen(false); useSketchStore.getState().setActiveTool(TOOLS.SELECT); }}><i className="bx bx-x text-2xl" /></button></div>
      <input ref={inputRef} value={url} onChange={(e) => { setUrl(e.target.value); setError(''); }} placeholder="https://www.youtube.com/watch?v=..." className="w-full rounded-xl border border-border-light bg-surface px-4 py-3 text-sm text-text-primary outline-none focus:border-accent" />
      {error && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border-light bg-surface/60 px-3 py-2.5"><p className="text-xs text-text-muted"><i className="bx bx-info-circle mr-1" />{error}</p><a href={whitelistRequestUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-accent/50 px-3 py-1.5 text-xs text-accent">Request whitelist</a></div>}
      <button type="submit" className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-sm text-white">Place on canvas</button>
    </form>
  </div>;
}
