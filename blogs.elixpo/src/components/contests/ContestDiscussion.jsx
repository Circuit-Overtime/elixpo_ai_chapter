'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

function discussionDate(epoch) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(epoch * 1000));
}

export default function ContestDiscussion({ slug, signedIn, cancelled = false }) {
  const [posts, setPosts] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/contests/${encodeURIComponent(slug)}/discussion`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Discussion could not be loaded');
      setPosts(result.posts || []);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/contests/${encodeURIComponent(slug)}/discussion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Post could not be added');
      setBody('');
      await load();
      setMessage('Posted to the discussion.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function remove(postId) {
    if (!window.confirm('Remove this discussion post?')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/contests/${encodeURIComponent(slug)}/discussion?postId=${encodeURIComponent(postId)}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Post could not be removed');
      setPosts((current) => current.filter((post) => post.id !== postId));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  return <section className="py-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Community</p><h2 className="mt-1 font-serif text-3xl font-extrabold text-[var(--text-primary)]">Contest discussion</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Ask for clarification, share resources, and talk with hosts and entrants.</p></div><span className="text-sm text-[var(--text-faint)]">{posts.length} posts</span></div>
    {cancelled ? <div className="mt-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-center text-sm text-[var(--text-muted)]">This discussion is read-only because the contest was cancelled.</div> : signedIn ? <form onSubmit={submit} className="mt-6 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-5"><label className="text-xs font-bold text-[var(--text-secondary)]">Add to the discussion<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} rows={4} placeholder="Ask a question or share something useful…" className="mt-2 w-full resize-y rounded-xl border border-[var(--border-default)] bg-[var(--input-bg)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /></label><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-[var(--text-faint)]">{body.length}/4000</span><button disabled={!body.trim() || busy} className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Posting…' : 'Post message'}</button></div></form> : <div className="mt-6 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-5 text-center text-sm text-[var(--text-muted)]"><Link href={`/sign-in?next=${encodeURIComponent(`/contests/${slug}?tab=discussion`)}`} className="font-bold text-[var(--accent)]">Sign in</Link> to join the discussion.</div>}
    {message && <p role="status" className="mt-4 rounded-xl bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-secondary)]">{message}</p>}
    <div className="mt-6 space-y-3">{loading ? <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-8 text-center text-sm text-[var(--text-muted)]">Loading discussion…</div> : posts.map((post) => <article key={post.id} className="rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] p-5"><div className="flex items-start justify-between gap-4"><Link href={`/${post.author.username}`} className="flex min-w-0 items-center gap-3">{post.author.avatarUrl ? <img src={post.author.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-subtle)] font-bold text-[var(--accent)]">{String(post.author.displayName || post.author.username).slice(0, 1).toUpperCase()}</span>}<span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--text-primary)]">{post.author.displayName}</span><span className="block text-[11px] text-[var(--text-faint)]">@{post.author.username} · {discussionDate(post.createdAt)}</span></span></Link>{post.canDelete && <button type="button" disabled={busy} onClick={() => remove(post.id)} className="text-xs font-semibold text-red-500">Remove</button>}</div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">{post.body}</p></article>)}{!loading && !posts.length && <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-10 text-center"><ion-icon name="chatbubbles-outline" style={{ fontSize: '30px', color: 'var(--accent)' }} /><p className="mt-3 text-sm font-bold text-[var(--text-primary)]">Start the conversation</p><p className="mt-1 text-xs text-[var(--text-muted)]">There are no discussion posts yet.</p></div>}</div>
  </section>;
}
