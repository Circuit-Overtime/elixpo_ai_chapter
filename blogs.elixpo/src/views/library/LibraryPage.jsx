'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import AppShell from '../../components/AppShell';
import Link from 'next/link';

const TABS = ['Collections', 'Saved', 'Read History'];

function timeAgo(ts) {
  if (!ts) return '';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 604800) return `${Math.floor(d / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function BlogRow({ b }) {
  return (
    <Link href={`/${b.author_username || 'blog'}/${b.slug}`} className="flex gap-4 py-4 group" style={{ borderBottom: '1px solid var(--divider)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {b.author_avatar
            ? <img src={b.author_avatar} alt="" className="h-4 w-4 rounded-full object-cover" />
            : <span className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: 'var(--bg-elevated)' }}>{(b.author_name || b.author_username || '?')[0].toUpperCase()}</span>}
          <span>{b.author_name || b.author_username}</span>
          {(b.saved_at || b.read_at) && <span style={{ color: 'var(--text-faint)' }}>· {timeAgo(b.saved_at || b.read_at)}</span>}
        </div>
        <p className="text-[16px] font-bold leading-snug group-hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)', fontFamily: "'Source Serif 4', Georgia, serif" }}>{b.title || 'Untitled'}</p>
        {b.subtitle && <p className="text-[13px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{b.subtitle}</p>}
        {Number(b.resume_progress) >= 0.05 && Number(b.resume_progress) < 0.9 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(Number(b.resume_progress) * 100)}%` }} /></span>
            <span className="text-[10px] font-semibold text-[var(--accent)]">Continue at {Math.round(Number(b.resume_progress) * 100)}%</span>
          </div>
        )}
      </div>
      {b.cover_image_r2_key && <img src={b.cover_image_r2_key} alt="" className="w-[80px] h-[80px] rounded-md object-cover flex-shrink-0 self-center hidden sm:block" />}
    </Link>
  );
}

export default function LibraryPage() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [collections, setCollections] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [history, setHistory] = useState([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState('');
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [collectionEntries, setCollectionEntries] = useState([]);
  const [entryBlogId, setEntryBlogId] = useState('');
  const [entryError, setEntryError] = useState('');
  const [entryBusy, setEntryBusy] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState(null);
  const [collectionSaving, setCollectionSaving] = useState(false);

  const loadCollections = useCallback(() => {
    fetch('/api/library/collections').then(r => r.json()).then(d => setCollections(d.collections || [])).catch(() => {});
  }, []);

  const openCollection = async (collection) => {
    if (collection.isDefault) { setActiveTab(1); return; }
    setSelectedCollection(collection);
    setCollectionDraft({
      name: collection.name || '',
      description: collection.description || '',
      introduction: collection.introduction || '',
      coverUrl: collection.coverUrl || '',
      visibility: collection.visibility || 'private',
    });
    setCollectionEntries([]);
    setEntryError('');
    const response = await fetch(`/api/library/collections/${encodeURIComponent(collection.id)}/entries`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) setCollectionEntries(data.entries || []);
    else setEntryError(data.error || 'Collection entries could not be loaded');
  };

  useEffect(() => {
    if (!user) return;
    if (activeTab === 0) loadCollections();
    if (activeTab === 1) fetch('/api/library/bookmarks').then(r => r.json()).then(d => setBookmarks(d.bookmarks || [])).catch(() => {});
    if (activeTab === 2) fetch('/api/library/history?limit=5').then(r => r.json()).then(d => setHistory(d.history || [])).catch(() => {});
  }, [user, activeTab, loadCollections]);

  const createList = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const r = await fetch('/api/library/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), visibility: 'private' }) });
      if (r.ok) {
        const data = await r.json();
        setNewName(''); setShowCreate(false); loadCollections();
        if (data.collection) openCollection(data.collection);
      }
    } finally { setCreating(false); }
  };

  const togglePublic = async (c) => {
    const visibility = c.visibility === 'public' ? 'private' : 'public';
    setCollections(cs => cs.map(x => x.id === c.id ? { ...x, visibility } : x));
    await fetch('/api/library/collections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, visibility }) }).catch(() => {});
  };

  const deleteList = async (c) => {
    if (!confirm(`Delete the list "${c.name}"? Saved posts move back to your default list.`)) return;
    setCollections(cs => cs.filter(x => x.id !== c.id));
    await fetch(`/api/library/collections?id=${c.id}`, { method: 'DELETE' }).catch(() => {});
    if (selectedCollection?.id === c.id) setSelectedCollection(null);
  };

  const copyShare = (c) => {
    const url = `${window.location.origin}/${user.username}/reads/${c.slug}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(c.id);
    setTimeout(() => setCopied(''), 1800);
  };

  const addEntry = async () => {
    if (!selectedCollection || !entryBlogId.trim() || entryBusy) return;
    setEntryBusy(true);
    setEntryError('');
    try {
      const response = await fetch(`/api/library/collections/${encodeURIComponent(selectedCollection.id)}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: entryBlogId.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The blog could not be added');
      setEntryBlogId('');
      await openCollection(selectedCollection);
      loadCollections();
    } catch (error) {
      setEntryError(error.message);
    } finally {
      setEntryBusy(false);
    }
  };

  const removeEntry = async (entry) => {
    if (!selectedCollection) return;
    const response = await fetch(`/api/library/collections/${encodeURIComponent(selectedCollection.id)}/entries?blogId=${encodeURIComponent(entry.blogId)}`, { method: 'DELETE' });
    if (response.ok) {
      setCollectionEntries(items => items.filter(item => item.blogId !== entry.blogId));
      loadCollections();
    }
  };

  const saveCollection = async () => {
    if (!selectedCollection || !collectionDraft?.name.trim() || collectionSaving) return;
    setCollectionSaving(true);
    setEntryError('');
    try {
      const response = await fetch('/api/library/collections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedCollection.id, ...collectionDraft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Collection details could not be saved');
      const updated = { ...selectedCollection, ...collectionDraft };
      setSelectedCollection(updated);
      setCollections(items => items.map(item => item.id === updated.id ? updated : item));
    } catch (error) {
      setEntryError(error.message);
    } finally {
      setCollectionSaving(false);
    }
  };

  const moveEntry = async (index, direction) => {
    const target = index + direction;
    if (!selectedCollection || target < 0 || target >= collectionEntries.length) return;
    const next = [...collectionEntries];
    [next[index], next[target]] = [next[target], next[index]];
    setCollectionEntries(next);
    const response = await fetch(`/api/library/collections/${encodeURIComponent(selectedCollection.id)}/entries`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map(entry => entry.blogId) }),
    });
    if (!response.ok) openCollection(selectedCollection);
  };

  if (loading) {
    return (
      <AppShell><div className="max-w-3xl mx-auto px-6 py-10">
        <div className="h-10 w-32 rounded mb-8 animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
        <div className="h-44 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
      </div></AppShell>
    );
  }

  // Auth is enforced by middleware (redirects to /sign-in?next=/library).
  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--text-primary)' }}>Library</h1>

        <div className="flex gap-6 mb-8" style={{ borderBottom: '1px solid var(--border-default)' }}>
          {TABS.map((tab, i) => (
            <button key={tab} onClick={() => setActiveTab(i)}
              className="pb-3 text-[14px] font-medium border-b-2 transition-colors"
              style={{ color: i === activeTab ? 'var(--text-primary)' : 'var(--text-muted)', borderBottomColor: i === activeTab ? 'var(--text-primary)' : 'transparent' }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Collections */}
        {activeTab === 0 && (
          <div>
            <div className="flex items-center justify-between w-full rounded-xl p-6 mb-8" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Create a reading list to organize and share posts</h2>
                <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Make a list public to share it at /{user.username}/reads/…</p>
                {showCreate ? (
                  <div className="flex items-center gap-2 mt-3">
                    <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createList()}
                      placeholder="List name…" className="flex-1 text-[14px] rounded-lg px-3 py-2 outline-none" style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
                    <button onClick={createList} disabled={creating || !newName.trim()} className="px-4 py-2 text-[13px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] rounded-full transition-colors disabled:opacity-50">Create</button>
                    <button onClick={() => { setShowCreate(false); setNewName(''); }} className="px-3 py-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setShowCreate(true)} className="mt-3 px-5 py-2 text-[13px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] rounded-full transition-colors">Start a collection</button>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              {collections.map(c => {
                const shareable = !c.isDefault;
                const isDefault = !!c.isDefault;
                return (
                  <div key={c.id} onClick={() => openCollection(c)} className="flex items-center gap-3 p-4 rounded-xl cursor-pointer" style={{ backgroundColor: selectedCollection?.id === c.id ? 'var(--accent-subtle)' : 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <ion-icon name="bookmark" style={{ fontSize: '18px', color: '#9b7bf7' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{c.name}{c.visibility === 'public' ? <span className="text-[10px] font-bold uppercase ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: '#16a34a22', color: '#16a34a' }}>Public</span> : null}</p>
                      <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{c.count} post{c.count !== 1 ? 's' : ''}{isDefault ? ' · view in Saved' : ''}</p>
                    </div>
                    {shareable && (
                      <>
                        <button onClick={(event) => { event.stopPropagation(); togglePublic(c); }} title={c.visibility === 'public' ? 'Make private' : 'Make public'} className="text-[12px] px-3 py-1.5 rounded-full transition-colors" style={c.visibility === 'public' ? { color: 'var(--text-muted)', border: '1px solid var(--border-default)' } : { color: '#fff', backgroundColor: '#9b7bf7' }}>
                          {c.visibility === 'public' ? 'Public' : 'Share'}
                        </button>
                        {c.visibility === 'public' && (
                          <button onClick={(event) => { event.stopPropagation(); copyShare(c); }} title="Copy link" className="flex items-center justify-center w-9 h-9 rounded-full transition-colors" style={{ color: copied === c.id ? '#16a34a' : 'var(--text-muted)' }}>
                            <ion-icon name={copied === c.id ? 'checkmark' : 'link-outline'} style={{ fontSize: '17px' }} />
                          </button>
                        )}
                        <button onClick={(event) => { event.stopPropagation(); deleteList(c); }} title="Delete" className="flex items-center justify-center w-9 h-9 rounded-full transition-colors" style={{ color: 'var(--text-faint)' }}>
                          <ion-icon name="trash-outline" style={{ fontSize: '16px' }} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedCollection && (
              <section className="mt-8 rounded-xl p-5" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Curate collection</p>
                    <h2 className="text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{selectedCollection.name}</h2>
                    <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>Posts stay owned by their authors and keep their original license and canonical link.</p>
                  </div>
                  <button onClick={() => setSelectedCollection(null)} className="p-2" title="Close" style={{ color: 'var(--text-muted)' }}><ion-icon name="close-outline" /></button>
                </div>
                <div className="flex gap-2 mb-2">
                  <input value={entryBlogId} onChange={event => setEntryBlogId(event.target.value)} onKeyDown={event => event.key === 'Enter' && addEntry()} placeholder="Paste a public blog ID" className="flex-1 text-[14px] rounded-lg px-3 py-2 outline-none" style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
                  <button onClick={addEntry} disabled={entryBusy || !entryBlogId.trim()} className="px-4 py-2 text-[13px] font-medium text-white bg-[#9b7bf7] rounded-lg disabled:opacity-50">{entryBusy ? 'Adding…' : 'Add post'}</button>
                </div>
                {entryError && <p className="text-[12px] mb-3 text-red-500">{entryError}</p>}
                {collectionDraft && (
                  <div className="grid gap-3 my-5 rounded-xl p-4" style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-default)' }}>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Name
                        <input value={collectionDraft.name} onChange={event => setCollectionDraft(draft => ({ ...draft, name: event.target.value }))} className="mt-1 w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
                      </label>
                      <label className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Visibility
                        <select value={collectionDraft.visibility} onChange={event => setCollectionDraft(draft => ({ ...draft, visibility: event.target.value }))} className="mt-1 w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
                          <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
                        </select>
                      </label>
                    </div>
                    <input value={collectionDraft.description} onChange={event => setCollectionDraft(draft => ({ ...draft, description: event.target.value }))} placeholder="Short description" className="w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
                    <textarea value={collectionDraft.introduction} onChange={event => setCollectionDraft(draft => ({ ...draft, introduction: event.target.value }))} placeholder="Editorial introduction" rows={3} className="w-full resize-y rounded-lg px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
                    <input value={collectionDraft.coverUrl} onChange={event => setCollectionDraft(draft => ({ ...draft, coverUrl: event.target.value }))} placeholder="https://… cover image" type="url" className="w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }} />
                    <button onClick={saveCollection} disabled={collectionSaving || !collectionDraft.name.trim()} className="justify-self-start rounded-lg bg-[#9b7bf7] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">{collectionSaving ? 'Saving…' : 'Save collection details'}</button>
                  </div>
                )}
                <div>
                  {collectionEntries.map((entry, index) => (
                    <div key={entry.blogId} className="flex items-center gap-3 py-3" style={{ borderTop: '1px solid var(--divider)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{entry.title}</p>
                        <p className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>By {entry.author.displayName} · {entry.license}</p>
                      </div>
                      <Link href={entry.canonicalUrl} className="text-[12px]" style={{ color: 'var(--accent)' }}>View original</Link>
                      <div className="flex flex-col">
                        <button onClick={() => moveEntry(index, -1)} disabled={index === 0} title="Move up" className="h-5 px-1 disabled:opacity-25" style={{ color: 'var(--text-muted)' }}><ion-icon name="chevron-up-outline" /></button>
                        <button onClick={() => moveEntry(index, 1)} disabled={index === collectionEntries.length - 1} title="Move down" className="h-5 px-1 disabled:opacity-25" style={{ color: 'var(--text-muted)' }}><ion-icon name="chevron-down-outline" /></button>
                      </div>
                      <button onClick={() => removeEntry(entry)} title="Remove from collection" className="p-2" style={{ color: 'var(--text-faint)' }}><ion-icon name="close-circle-outline" /></button>
                    </div>
                  ))}
                  {!collectionEntries.length && !entryError && <p className="text-[13px] py-5 text-center" style={{ color: 'var(--text-muted)' }}>No curated posts yet.</p>}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Saved */}
        {activeTab === 1 && (
          bookmarks.length > 0
            ? <div>{bookmarks.map(b => <BlogRow key={b.blog_id} b={b} />)}</div>
            : <div className="text-center py-16"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>No saved posts yet. Bookmark posts to see them here.</p></div>
        )}

        {/* Read History */}
        {activeTab === 2 && (
          history.length > 0
            ? <div>{history.map((b, i) => <BlogRow key={`${b.slug}-${i}`} b={b} />)}</div>
            : <div className="text-center py-16"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your reading history will appear here.</p></div>
        )}
      </div>
    </AppShell>
  );
}
