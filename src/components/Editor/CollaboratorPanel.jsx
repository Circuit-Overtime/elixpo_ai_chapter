'use client';

import { useState, useEffect, useCallback } from 'react';
import { generatePixelAvatar } from '../../utils/pixelAvatar';

const ROLES = [
  { value: 'viewer', label: 'Viewer', desc: 'Can view the blog in the editor' },
  { value: 'editor', label: 'Editor', desc: 'Can edit the blog content' },
  { value: 'admin', label: 'Admin', desc: 'Can edit, publish, and manage collaborators' },
];

export default function CollaboratorPanel({ slugid, onClose }) {
  const [author, setAuthor] = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const fetchCollabs = useCallback(async () => {
    try {
      const res = await fetch(`/api/blogs/invite?slugid=${slugid}`);
      if (res.ok) {
        const data = await res.json();
        setAuthor(data.author);
        setCollaborators(data.collaborators || []);
        setCanManage(data.canManage);
      }
    } catch {}
    setLoading(false);
  }, [slugid]);

  useEffect(() => { fetchCollabs(); }, [fetchCollabs]);

  // Search users debounced
  useEffect(() => {
    if (!inviteUsername || inviteUsername.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(inviteUsername)}&scope=users`)
        .then(r => r.ok ? r.json() : { users: [] })
        .then(d => {
          const existing = new Set([author?.id, ...collaborators.map(c => c.id)]);
          setSearchResults((d.users || []).filter(u => !existing.has(u.id)));
          setSearching(false);
        })
        .catch(() => { setSearchResults([]); setSearching(false); });
    }, 400);
    return () => clearTimeout(timer);
  }, [inviteUsername, author, collaborators]);

  const handleInvite = async (username) => {
    if (inviting) return;
    setInviting(true);
    setInviteError('');
    try {
      const res = await fetch('/api/blogs/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugid, username, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteUsername('');
        setSearchResults([]);
        fetchCollabs();
      } else {
        setInviteError(data.error || 'Failed to invite');
      }
    } catch { setInviteError('Network error'); }
    setInviting(false);
  };

  const handleChangeRole = async (userId, role) => {
    await fetch('/api/blogs/invite', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugid, userId, role }),
    });
    fetchCollabs();
  };

  const handleRemove = async (userId) => {
    await fetch('/api/blogs/invite', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugid, userId }),
    });
    fetchCollabs();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[400px] z-50 flex flex-col shadow-2xl transition-transform" style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Collaborators</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-faint)' }}>Manage who can access this blog</p>
          </div>
          <button onClick={onClose} className="p-1 transition-colors" style={{ color: 'var(--text-faint)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
          {/* Invite form — only if can manage */}
          {canManage && (
            <div>
              <label className="text-[12px] font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>Invite people</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    value={inviteUsername}
                    onChange={e => { setInviteUsername(e.target.value); setInviteError(''); }}
                    onKeyDown={e => e.key === 'Enter' && inviteUsername && handleInvite(inviteUsername)}
                    placeholder="Search username..."
                    className="w-full rounded-lg px-3 py-2 outline-none text-[13px] transition-colors"
                    style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 rounded-lg shadow-xl z-10 overflow-hidden max-h-[200px] overflow-y-auto" style={{ backgroundColor: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)' }}>
                      {searchResults.map(u => (
                        <button
                          key={u.id}
                          onClick={() => handleInvite(u.username)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                          style={{ color: 'var(--text-primary)' }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <img src={u.avatar_url || generatePixelAvatar(u.username || u.display_name)} alt="" className="w-6 h-6 rounded-full object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] truncate">{u.display_name || u.username}</p>
                            <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>@{u.username}</p>
                          </div>
                          <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>Invite</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {inviteUsername.length >= 2 && searchResults.length === 0 && !searching && (
                    <div className="absolute top-full mt-1 left-0 right-0 rounded-lg shadow-xl z-10 px-3 py-3 text-[12px]" style={{ backgroundColor: 'var(--dropdown-bg)', border: '1px solid var(--dropdown-border)', color: 'var(--text-faint)' }}>
                      No users found
                    </div>
                  )}
                </div>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="rounded-lg px-2 py-2 text-[12px] outline-none"
                  style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--input-border)' }}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {inviteError && <p className="text-[11px] mt-1.5" style={{ color: '#f87171' }}>{inviteError}</p>}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: 'var(--divider)' }} />

          {/* Author (always shown, not editable) */}
          {author && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--text-faint)' }}>Author</label>
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <img src={author.avatar_url || generatePixelAvatar(author.username || author.display_name)} alt="" className="w-9 h-9 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{author.display_name || author.username}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>@{author.username}</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: '#9b7bf714', color: '#9b7bf7', border: '1px solid #9b7bf730' }}>
                  Owner
                </span>
              </div>
            </div>
          )}

          {/* Collaborators list */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest mb-3 block" style={{ color: 'var(--text-faint)' }}>
              Members {collaborators.length > 0 && `(${collaborators.length})`}
            </label>

            {loading ? (
              <div className="space-y-3">
                {[1,2].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />)}
              </div>
            ) : collaborators.length === 0 ? (
              <div className="text-center py-8">
                <ion-icon name="people-outline" style={{ fontSize: '32px', color: 'var(--text-faint)' }} />
                <p className="text-[13px] mt-2" style={{ color: 'var(--text-muted)' }}>No collaborators yet</p>
                {canManage && <p className="text-[12px] mt-1" style={{ color: 'var(--text-faint)' }}>Invite people to collaborate on this blog.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {collaborators.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <img src={c.avatar_url || generatePixelAvatar(c.username || c.display_name)} alt="" className="w-9 h-9 rounded-full object-cover" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.display_name || c.username}</p>
                        {/* Status badge */}
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: c.status === 'accepted' ? '#4ade8014' : '#fbbf2414',
                            color: c.status === 'accepted' ? '#4ade80' : '#fbbf24',
                            border: `1px solid ${c.status === 'accepted' ? '#4ade8030' : '#fbbf2430'}`,
                          }}
                        >
                          {c.status === 'accepted' ? 'Joined' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>@{c.username}</p>
                    </div>

                    {/* Role dropdown + remove — only if canManage */}
                    {canManage ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={c.role}
                          onChange={e => handleChangeRole(c.id, e.target.value)}
                          className="rounded-md px-1.5 py-1 text-[11px] outline-none"
                          style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', border: '1px solid var(--input-border)' }}
                        >
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <button
                          onClick={() => handleRemove(c.id)}
                          className="p-1 transition-colors rounded"
                          style={{ color: 'var(--text-faint)' }}
                          title="Remove collaborator"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] capitalize px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                        {c.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Role descriptions */}
          {canManage && (
            <div className="pt-2">
              <label className="text-[11px] font-semibold uppercase tracking-widest mb-2 block" style={{ color: 'var(--text-faint)' }}>Roles</label>
              <div className="space-y-1.5">
                {ROLES.map(r => (
                  <div key={r.value} className="flex items-start gap-2">
                    <span className="text-[12px] font-medium min-w-[50px]" style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
                    <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{r.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
