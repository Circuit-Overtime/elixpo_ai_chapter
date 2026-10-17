'use client';

import { createReactInlineContentSpec } from '@blocknote/react';
import { useState, useRef, useEffect } from 'react';

function MentionChip({ username, displayName, avatarUrl }) {
  const [showCard, setShowCard] = useState(false);
  const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
  const [profile, setProfile] = useState(null);
  const [fetched, setFetched] = useState(false);
  const chipRef = useRef(null);
  const hoverTimer = useRef(null);

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => {
      if (chipRef.current) {
        const rect = chipRef.current.getBoundingClientRect();
        setCardPos({ top: rect.bottom + 6, left: rect.left });
      }
      setShowCard(true);
      // Fetch full profile on first hover
      if (!fetched) {
        setFetched(true);
        fetch(`/api/resolve?name=${encodeURIComponent(username)}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setProfile(d); })
          .catch(() => {});
      }
    }, 350);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimer.current);
    setShowCard(false);
  };

  const u = profile?.user || null;
  const orgs = profile?.orgs || [];

  return (
    <>
      <a
        ref={chipRef}
        href={`/${username}`}
        className="mention-chip"
        data-mention-type="user"
        data-username={username}
        data-display-name={displayName}
        data-avatar-url={avatarUrl || ''}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => { e.stopPropagation(); }}
        style={{ textDecoration: 'none' }}
        spellCheck={false}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="mention-chip-avatar" />
        ) : (
          <span className="mention-chip-initial">
            {(displayName || username || '?')[0].toUpperCase()}
          </span>
        )}
        @{username}
      </a>

      {showCard && (
        <div
          style={{ position: 'fixed', top: cardPos.top, left: cardPos.left, zIndex: 9999 }}
          className="mention-hover-card"
          onMouseEnter={() => clearTimeout(hoverTimer.current)}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            {(u?.avatar_url || avatarUrl) ? (
              <img src={u?.avatar_url || avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #232d3f' }} />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: '#232d3f',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: 'var(--text-muted)',
              }}>
                {(displayName || username || '?')[0].toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {u?.display_name || displayName || username}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{username}</div>
            </div>
          </div>

          {/* Bio */}
          {u?.bio && (
            <div style={{ fontSize: 12, color: '#b0b0b0', lineHeight: 1.5, marginBottom: '10px', maxHeight: '3em', overflow: 'hidden' }}>
              {u.bio}
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '14px', fontSize: 12, color: 'var(--text-muted)', marginBottom: '10px' }}>
            <span><strong style={{ color: 'var(--text-primary)' }}>{u?.followers ?? 0}</strong> followers</span>
            <span><strong style={{ color: 'var(--text-primary)' }}>{u?.following ?? 0}</strong> following</span>
            {(profile?.blogs?.length > 0) && (
              <span><strong style={{ color: 'var(--text-primary)' }}>{profile.blogs.length}</strong> blogs</span>
            )}
          </div>

          {/* Orgs — show if available from blogs or fetch */}
          {/* TODO: orgs could be fetched separately if needed */}

        </div>
      )}
    </>
  );
}

export const MentionInline = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      username: { default: '' },
      displayName: { default: '' },
      avatarUrl: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => {
      const { username, displayName, avatarUrl } = inlineContent.props;
      return <MentionChip username={username} displayName={displayName} avatarUrl={avatarUrl} />;
    },
    parse: (el) => {
      if (el.getAttribute('data-mention-type') === 'user') {
        return {
          username: el.getAttribute('data-username') || '',
          displayName: el.getAttribute('data-display-name') || '',
          avatarUrl: el.getAttribute('data-avatar-url') || '',
        };
      }
      return undefined;
    },
  }
);
