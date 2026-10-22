'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';
import { generatePixelAvatar } from '../utils/pixelAvatar';

const ROLE_LABELS = { admin: 'Admin', maintain: 'Maintain', write: 'Write', read: 'Read' };

export default function JoinOrgPage({ inviteId }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState('loading'); // loading | preview | joining | error
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // Send the user to the org page with a one-shot toast flag.
  const goToOrg = useCallback((slug, kind) => {
    router.replace(`/${slug}?joined=${kind}`);
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    // Must be signed in first — bounce through sign-in and come back here.
    if (!user) {
      window.location.href = `/sign-in?next=${encodeURIComponent(`/org/join/${inviteId}`)}`;
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/orgs/invite?inviteId=${encodeURIComponent(inviteId)}`);
        const d = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok || !d.org) { setError(d.error || 'This invite is no longer valid.'); setPhase('error'); return; }
        if (d.alreadyMember) { goToOrg(d.org.slug, 'member'); return; }
        if (!d.invite?.valid) { setError(d.invite?.expired ? 'This invite has expired.' : 'This invite has reached its limit.'); setPhase('error'); return; }
        setData(d);
        setPhase('preview');
      } catch {
        if (active) { setError('Failed to load this invite.'); setPhase('error'); }
      }
    })();
    return () => { active = false; };
  }, [authLoading, user, inviteId, goToOrg]);

  const handleJoin = async () => {
    if (!data?.org) return;
    setPhase('joining');
    try {
      const res = await fetch('/api/orgs/invite', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { goToOrg(d.orgSlug || data.org.slug, '1'); return; }
      if (res.status === 409) { goToOrg(data.org.slug, 'member'); return; } // already a member
      setError(d.error || 'Failed to join.');
      setPhase('error');
    } catch {
      setError('Failed to join.');
      setPhase('error');
    }
  };

  const org = data?.org;
  const ownerName = data?.owner?.display_name || data?.owner?.username || '';
  const avatar = org?.logo_url || (org ? generatePixelAvatar(org.slug) : '');

  return (
    <AppShell>
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center">
          {(phase === 'loading' || phase === 'joining') && (
            <div className="flex flex-col items-center gap-4 py-10">
              <span className="h-8 w-8 rounded-full border-2 border-[var(--border-default)] border-t-[#9b7bf7] animate-spin" />
              <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
                {phase === 'joining' ? 'Joining…' : 'Loading invite…'}
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(248,113,113,0.12)' }}>
                <ion-icon name="alert-circle-outline" style={{ fontSize: '26px', color: '#f87171' }} />
              </div>
              <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>{error}</p>
              <Link href="/" className="text-[13px] font-medium" style={{ color: 'var(--accent)' }}>Go home</Link>
            </div>
          )}

          {phase === 'preview' && org && (
            <div className="rounded-2xl p-8" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
              <img src={avatar} alt="" className="h-20 w-20 rounded-2xl object-cover mx-auto mb-4" style={{ border: '1px solid var(--border-default)' }} />
              <p className="text-[12px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--accent)' }}>You're invited to join</p>
              <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{org.name}</h1>
              {ownerName && <p className="text-[13px] mb-1" style={{ color: 'var(--text-muted)' }}>by {ownerName}</p>}
              {(org.tagline || org.description) && <p className="text-[13px] mt-2 mb-1" style={{ color: 'var(--text-muted)' }}>{org.tagline || org.description}</p>}
              <p className="text-[12px] mt-3 mb-5" style={{ color: 'var(--text-faint)' }}>
                Role: <span style={{ color: 'var(--text-secondary)' }}>{ROLE_LABELS[data.invite.role] || data.invite.role}</span>
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleJoin}
                  className="flex-1 py-2.5 bg-[#9b7bf7] text-white font-semibold rounded-xl text-[14px] hover:bg-[#b69aff] transition-colors"
                >
                  Join {org.name}
                </button>
                <Link
                  href={`/${org.slug}`}
                  className="px-4 py-2.5 rounded-xl text-[14px] font-medium transition-colors"
                  style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                >
                  View first
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
