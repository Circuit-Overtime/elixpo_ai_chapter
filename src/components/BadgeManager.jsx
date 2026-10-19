'use client';

import { useEffect, useState } from 'react';
import { CreatorBadgeMark } from './CreatorBadge';

export default function BadgeManager() {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/badges', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setBadges(data.badges || []))
      .catch(() => setError('Badges are temporarily unavailable.'))
      .finally(() => setLoading(false));
  }, []);

  async function updateBadge(badge, changes) {
    setBusyId(badge.id);
    setError('');
    try {
      const response = await fetch('/api/badges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badgeId: badge.id,
          visible: changes.visible ?? !!badge.visible,
          pinnedPosition: changes.pinnedPosition !== undefined
            ? changes.pinnedPosition
            : badge.pinned_position,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not update badge');
      setBadges(data.badges || []);
    } catch (requestError) {
      setError(requestError.message || 'Could not update badge');
    } finally {
      setBusyId('');
    }
  }

  function togglePin(badge) {
    if (badge.pinned_position) {
      updateBadge(badge, { pinnedPosition: null });
      return;
    }
    const occupied = new Set(badges.map((item) => Number(item.pinned_position)).filter(Boolean));
    const position = [1, 2, 3].find((candidate) => !occupied.has(candidate));
    if (!position) {
      setError('Unpin one of your three highlighted badges first.');
      return;
    }
    updateBadge(badge, { visible: true, pinnedPosition: position });
  }

  return (
    <section id="creator-badges" className="mb-8 scroll-mt-20">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Badges</h2>
        <span className="text-[11px] text-[var(--text-faint)]">Up to 3 pinned</span>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((item) => <div key={item} className="h-20 w-36 shrink-0 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />)}
        </div>
      ) : badges.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((badge) => (
            <article key={badge.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              <CreatorBadgeMark badge={badge} size={40} />
              <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-primary)]">{badge.name}</p>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={busyId === badge.id}
                  onClick={() => updateBadge(badge, { visible: !badge.visible, pinnedPosition: badge.visible ? null : badge.pinned_position })}
                  className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors disabled:opacity-50 ${badge.visible ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500' : 'border-[var(--border-default)] text-[var(--text-faint)] hover:text-[var(--text-primary)]'}`}
                  aria-label={`${badge.visible ? 'Hide' : 'Show'} ${badge.name}`}
                  title={badge.visible ? 'Shown publicly — click to hide' : 'Hidden — click to show'}
                >
                  <ion-icon name={badge.visible ? 'eye-outline' : 'eye-off-outline'} />
                </button>
                <button
                  type="button"
                  disabled={busyId === badge.id}
                  onClick={() => togglePin(badge)}
                  className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors disabled:opacity-50 ${badge.pinned_position ? 'border-[#9b7bf7]/30 bg-[var(--accent-subtle)] text-[var(--accent)]' : 'border-[var(--border-default)] text-[var(--text-faint)] hover:text-[var(--text-primary)]'}`}
                  aria-label={`${badge.pinned_position ? 'Unpin' : 'Pin'} ${badge.name}`}
                  title={badge.pinned_position ? `Pinned in position ${badge.pinned_position}` : 'Pin to profile highlights'}
                >
                  <ion-icon name={badge.pinned_position ? 'pin' : 'pin-outline'} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--border-default)] p-4">
          <CreatorBadgeMark badge={{ icon: 'ribbon-outline' }} size={40} muted />
          <p className="text-[12px] text-[var(--text-muted)]">Earned badges will appear here.</p>
        </div>
      )}
      {error && <p className="mt-3 text-[11px] text-red-500">{error}</p>}
    </section>
  );
}
