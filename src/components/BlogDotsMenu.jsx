'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
export default function BlogDotsMenu({ blogId, authorId, author = {}, org = null, tags = [], hideHighlights, onToggleHighlights, canEdit = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [fAuthor, setFAuthor] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [fOrg, setFOrg] = useState(false);
  const [done, setDone] = useState('');
  const [coAuthorVisible, setCoAuthorVisible] = useState(null); // null = not a co-author; true/false = show_on_profile
  const ref = useRef(null);
  const ownsAuthor = !!user && user.id === authorId;
  const ownsPublication = !!org && canEdit;

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Ctrl/Cmd + / toggles highlights.
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); onToggleHighlights?.(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onToggleHighlights]);

  // Resolve follow state on open.
  useEffect(() => {
    if (!open || !user) return;
    if (author?.username) fetch(`/api/users/${author.username}/follow`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setFAuthor(!!d.following); setIsSelf(!!d.self); } }).catch(() => {});
    if (org?.slug) fetch(`/api/orgs/${org.slug}/follow`).then(r => r.ok ? r.json() : null).then(d => d && setFOrg(!!d.following)).catch(() => {});
    // Am I an accepted co-author here (not the primary author)? If so, surface
    // a "show on my profile" toggle.
    if (blogId && user.id !== authorId) {
      fetch(`/api/blogs/invite?slugid=${encodeURIComponent(blogId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const mine = (d?.collaborators || []).find(c => c.id === user.id && c.status === 'accepted');
          setCoAuthorVisible(mine ? mine.show_on_profile !== 0 : null);
        }).catch(() => {});
    }
  }, [open, user, blogId, authorId]);

  const toggleProfileVisibility = () => {
    if (needAuth() || coAuthorVisible === null) return;
    const next = !coAuthorVisible;
    setCoAuthorVisible(next);
    fetch('/api/blogs/invite', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugid: blogId, showOnProfile: next }),
    }).catch(() => {});
    flash(next ? 'Showing on your profile' : 'Hidden from your profile');
  };

  const needAuth = () => { if (!user) { window.location.href = `/sign-in?next=${typeof window !== 'undefined' ? window.location.pathname : '/'}`; return true; } return false; };
  const post_ = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  const flash = (m) => { setDone(m); setTimeout(() => { setDone(''); setOpen(false); }, 900); };

  const showLess = () => {
    if (needAuth()) return;
    post_('/api/signals', { blogId, tags, type: 'show_less', weight: -2 });
    if (tags.length) {
      fetch('/api/users/me/interests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: tags }),
      }).then(response => response.ok ? response.json() : null)
        .then(data => {
          if (Array.isArray(data?.interests)) {
            window.dispatchEvent(new CustomEvent('lixblogs:interests-changed', { detail: { interests: data.interests } }));
          }
        }).catch(() => {});
    }
    flash('We’ll show you less like this');
  };
  const toggleHi = () => { onToggleHighlights?.(); setOpen(false); };
  const followAuthor = () => { if (needAuth() || fAuthor) return; setFAuthor(true); post_(`/api/users/${author.username}/follow`); flash('Following'); };
  const followOrg = () => { if (needAuth() || fOrg) return; setFOrg(true); post_(`/api/orgs/${org.slug}/follow`); flash('Following'); };
  const muteAuthor = () => { if (needAuth()) return; post_('/api/mutes', { targetType: 'author', targetId: authorId }); flash('Author muted'); };
  const muteOrg = () => { if (needAuth()) return; post_('/api/mutes', { targetType: 'org', targetId: org.id }); flash('Publication muted'); };
  const muteTopics = () => { if (needAuth()) return; tags.forEach(t => post_('/api/mutes', { targetType: 'tag', targetId: t, blogId })); flash('Topics muted'); };
  const report = () => { if (needAuth()) return; setOpen(false); if (!confirm('Report this story to the moderators?')) return; post_(`/api/blogs/${blogId}/report`, { reason: 'other', detail: 'Reported from reader' }); };

  const Row = ({ icon, label, onClick, danger, badge, disabled, kbd }) => (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      className="w-full text-left px-4 py-2 text-[14px] flex items-center gap-3 transition-colors"
      style={{ color: danger ? '#ef4444' : 'var(--text-body)', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
      {icon && <ion-icon name={icon} style={{ fontSize: '17px', color: danger ? '#ef4444' : 'var(--text-faint)' }} />}
      <span className="flex-1">{label}</span>
      {badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#16a34a', color: '#fff' }}>New</span>}
      {kbd && <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-faint)', border: '1px solid var(--border-default)' }}>{kbd}</kbd>}
    </button>
  );
  const Divider = () => <div className="my-1.5" style={{ borderTop: '1px solid var(--divider)' }} />;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-center w-9 h-9 rounded-full transition-colors" style={{ color: 'var(--text-muted)' }} title="More" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
        <ion-icon name="ellipsis-horizontal" style={{ fontSize: '20px' }} />
      </button>
      {open && (
        <div className="absolute right-0 bottom-11 z-50 w-64 rounded-xl py-1.5" style={{ backgroundColor: 'var(--dropdown-bg, var(--bg-surface))', border: '1px solid var(--border-default)', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
          {done ? (
            <div className="px-4 py-3 text-[13px] flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <ion-icon name="checkmark-circle" style={{ fontSize: '16px', color: '#16a34a' }} /> {done}
            </div>
          ) : (
            <>
              {!isSelf && <Row icon="thumbs-down-outline" label="Show less like this" onClick={showLess} />}
              <Row icon={hideHighlights ? 'eye-outline' : 'color-wand-outline'} label={hideHighlights ? 'Show highlights' : 'Hide highlights'} onClick={toggleHi} kbd="Ctrl /" />
              {coAuthorVisible !== null && (
                <Row
                  icon={coAuthorVisible ? 'eye-off-outline' : 'person-outline'}
                  label={coAuthorVisible ? 'Hide from my profile' : 'Show on my profile'}
                  onClick={toggleProfileVisibility}
                />
              )}
              <Divider />
              {canEdit ? (
                <>
                  <Row icon="create-outline" label="Edit story" onClick={() => { window.location.href = `/edit/${blogId}`; }} />
                  <Row icon="options-outline" label="Story settings" onClick={() => { window.location.href = `/edit/${blogId}?panel=settings`; }} />
                  {ownsPublication && <Row icon="business-outline" label="Publication settings" onClick={() => { window.location.href = `/settings/org/${org.slug}`; }} />}
                </>
              ) : (
                <>
                  {!ownsAuthor && !isSelf && <Row label={fAuthor ? `Following ${author.display_name || author.username}` : `Follow ${author.display_name || author.username}`} onClick={followAuthor} disabled={fAuthor} />}
                  {org && !ownsPublication && <Row label={fOrg ? `Following ${org.name}` : `Follow ${org.name}`} onClick={followOrg} disabled={fOrg} />}
                  <Divider />
                  {!ownsAuthor && !isSelf && <Row label="Mute author" onClick={muteAuthor} />}
                  {org && !ownsPublication && <Row label="Mute publication" onClick={muteOrg} />}
                  {tags.length > 0 && <Row label="Mute topics" onClick={muteTopics} badge />}
                  <Divider />
                  <Row label="Report story…" onClick={report} danger />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
