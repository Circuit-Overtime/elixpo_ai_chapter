'use client';

import { useState } from 'react';

const DIFFICULTY_COLORS = {
  Easy: '#60a5fa',
  Moderate: '#9b7bf7',
  Hard: '#f59e0b',
  Exceptional: '#ec4899',
};

export function CreatorBadgeMark({ badge, size = 38, muted = false }) {
  const color = DIFFICULTY_COLORS[badge?.difficulty] || '#9b7bf7';
  const [artworkFailed, setArtworkFailed] = useState(false);
  const showArtwork = !muted && badge?.artwork && !artworkFailed;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{
        width: size,
        height: size,
        color: muted ? 'var(--text-faint)' : color,
        background: showArtwork ? 'transparent' : muted ? 'var(--bg-elevated)' : `color-mix(in srgb, ${color} 14%, var(--bg-surface))`,
        border: showArtwork ? 'none' : `1px solid ${muted ? 'var(--border-default)' : `color-mix(in srgb, ${color} 38%, var(--border-default))`}`,
      }}
      aria-hidden="true"
    >
      {showArtwork ? (
        <img
          src={badge.artwork}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setArtworkFailed(true)}
        />
      ) : (
        <ion-icon name={badge?.icon || 'ribbon-outline'} style={{ fontSize: Math.round(size * .48) }} />
      )}
      {badge?.pinned_position && (
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[var(--bg-app)]" style={{ backgroundColor: color }} />
      )}
    </span>
  );
}

export function CreatorBadgeStrip({ badges = [], emptyText = null, compact = false, showDetails = true }) {
  if (!badges.length) {
    return emptyText ? <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{emptyText}</p> : null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Creator badges">
      {badges.map((badge) => (
        <span
          key={badge.id}
          className={showDetails ? 'group/badge relative' : 'relative'}
          title={showDetails ? `${badge.name}: ${badge.description}` : undefined}
          aria-label={!showDetails ? badge.name : undefined}
        >
          <CreatorBadgeMark badge={badge} size={compact ? 30 : 38} />
          {showDetails && (
            <span className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 hidden w-52 -translate-x-1/2 rounded-lg px-3 py-2 text-left shadow-xl group-hover/badge:block" style={{ backgroundColor: 'var(--dropdown-bg, var(--bg-surface))', border: '1px solid var(--border-default)' }}>
              <strong className="block text-[11px]" style={{ color: 'var(--text-primary)' }}>{badge.name}</strong>
              <span className="mt-0.5 block text-[10px] leading-4" style={{ color: 'var(--text-muted)' }}>{badge.description}</span>
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
