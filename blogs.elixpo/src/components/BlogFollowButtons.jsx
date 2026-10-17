'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';

// Generic follow toggle for a user or an org. `kind` = 'user' | 'org'.
export function FollowToggle({ kind, handle, compact = false }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [self, setSelf] = useState(false);
  const base = kind === 'org'
    ? `/api/orgs/${encodeURIComponent(handle)}/follow`
    : `/api/users/${encodeURIComponent(handle)}/follow`;

  useEffect(() => {
    if (!user || !handle) return;
    let active = true;
    fetch(base).then(r => r.ok ? r.json() : null).then(d => {
      if (!active || !d) return;
      setFollowing(!!d.following);
      setSelf(!!d.self);
    }).catch(() => {});
    return () => { active = false; };
  }, [handle, user]);

  if (self) return null;

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      const next = typeof window !== 'undefined' ? window.location.pathname : '/';
      window.location.href = `/sign-in?next=${encodeURIComponent(next)}`;
      return;
    }
    const was = following;
    setFollowing(!was);
    fetch(base, { method: was ? 'DELETE' : 'POST' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setFollowing(!!d.following))
      .catch(() => setFollowing(was));
  };

  return (
    <button
      onClick={toggle}
      className={`${compact ? 'text-[12px] px-3 py-1' : 'text-[13px] px-4 py-1.5'} font-medium rounded-full transition-colors flex-shrink-0`}
      style={following
        ? { color: 'var(--text-muted)', border: '1px solid var(--border-default)' }
        : { color: '#fff', backgroundColor: '#9b7bf7' }}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

// End-of-blog follow card — author (+ org when applicable). `author` =
// { username, display_name, designation, avatar_url }; `org` = { slug, name, logo_url }.
export default function BlogFollowCard({ author, org }) {
  const rows = [];
  if (org?.slug) rows.push({ kind: 'org', handle: org.slug, name: org.name, avatar: org.logo_url, href: `/${org.slug}`, square: true });
  if (author?.username) rows.push({
    kind: 'user',
    handle: author.username,
    name: author.display_name || author.username,
    sub: author.designation ? `${author.designation} · @${author.username}` : `@${author.username}`,
    avatar: author.avatar_url,
    href: `/${author.username}`,
  });
  if (rows.length === 0) return null;

  return (
    <div className="my-10 rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      <p className="text-[12px] font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-faint)' }}>
        Keep up with {rows.length > 1 ? 'them' : 'their work'}
      </p>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={`${r.kind}:${r.handle}`} className="flex items-center gap-3">
            <Link href={r.href} className="flex-shrink-0">
              {r.avatar ? (
                <img src={r.avatar} alt="" className={`h-11 w-11 object-cover ${r.square ? 'rounded-lg' : 'rounded-full'}`} />
              ) : (
                <div className={`h-11 w-11 flex items-center justify-center text-[15px] font-bold ${r.square ? 'rounded-lg' : 'rounded-full'}`} style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-faint)' }}>{(r.name || '?')[0].toUpperCase()}</div>
              )}
            </Link>
            <Link href={r.href} className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{r.name}{r.kind === 'org' && <span className="text-[11px] font-normal ml-1.5" style={{ color: 'var(--text-faint)' }}>Organization</span>}</p>
              {r.sub && <p className="text-[12px] truncate" style={{ color: 'var(--text-faint)' }}>{r.sub}</p>}
            </Link>
            <FollowToggle kind={r.kind} handle={r.handle} />
          </div>
        ))}
      </div>
    </div>
  );
}
