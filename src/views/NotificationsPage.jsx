'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';
import Link from 'next/link';
import { CreatorBadgeMark } from '../components/CreatorBadge';
import { CREATOR_BADGE_MAP } from '../../lib/badgeDefinitions';
import { dispatchNotificationsUpdate } from '../utils/notificationEvents';

const NOTIF_CONFIG = {
  follow:         { icon: 'person-add-outline',     color: '#9b7bf7', label: 'followed you' },
  comment:        { icon: 'chatbubble-outline',     color: '#60a5fa', label: 'commented on' },
  like:           { icon: 'heart-outline',           color: '#f87171', label: 'liked' },
  mention:        { icon: 'at-outline',              color: '#fbbf24', label: 'mentioned you in' },
  org_invite:     { icon: 'people-outline',          color: '#4ade80', label: 'invited you to' },
  blog_invite:    { icon: 'create-outline',          color: '#c084fc', label: 'invited you to collaborate on' },
  blog_published: { icon: 'document-text-outline',   color: '#60a5fa', label: 'published' },
  badge_awarded:  { icon: 'ribbon-outline',          color: '#ec4899', label: 'awarded you' },
  collection_add: { icon: 'albums-outline',          color: '#14b8a6', label: 'added your story to' },
  contest_submission: { icon: 'document-attach-outline', color: '#0ea5e9', label: 'submitted an entry to' },
  contest_role: { icon: 'people-circle-outline', color: '#8b5cf6', label: 'assigned you a contest role in' },
  contest_results: { icon: 'trophy-outline', color: '#f59e0b', label: 'published results for' },
  contest_opened: { icon: 'flag-outline', color: '#22c55e', label: 'opened' },
  contest_deadline: { icon: 'timer-outline', color: '#f97316', label: 'is closing soon:' },
  contest_judging: { icon: 'scale-outline', color: '#6366f1', label: 'entered judging:' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'follow', label: 'Followers' },
  { key: 'comment', label: 'Comments' },
  { key: 'like', label: 'Likes' },
  { key: 'mention', label: 'Mentions' },
  { key: 'invite', label: 'Invites' },
  { key: 'badge_awarded', label: 'Badges' },
];

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupByDate(notifications) {
  const groups = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  const yesterday = today - 86400;
  const weekAgo = today - 604800;

  for (const n of notifications) {
    let label;
    if (n.created_at >= today) label = 'Today';
    else if (n.created_at >= yesterday) label = 'Yesterday';
    else if (n.created_at >= weekAgo) label = 'This Week';
    else label = 'Earlier';

    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  return groups;
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [resolvedInvites, setResolvedInvites] = useState({}); // notifId -> 'accepted' | 'declined'
  const [resolvingInvites, setResolvingInvites] = useState({});

  // A blog_invite notification carries the blog id in target_id (or /edit/<id>).
  const inviteSlugid = (n) => n.target_id || (n.target_url || '').split('/edit/')[1] || '';

  const respondInvite = async (n, accept) => {
    const slugid = inviteSlugid(n);
    if (!slugid || resolvingInvites[n.id]) return;
    setResolvingInvites(prev => ({ ...prev, [n.id]: true }));
    try {
      const res = accept
        ? await fetch('/api/blogs/invite', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugid, accept: true }),
        })
        : await fetch('/api/blogs/invite', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugid }),
        });
      if (!res.ok) throw new Error('Failed to update invitation');
      setResolvedInvites(prev => ({ ...prev, [n.id]: accept ? 'accepted' : 'declined' }));
      if (!n.read) markRead(n.id);
    } catch {
      // Keep the authoritative pending state visible so the user can retry.
    } finally {
      setResolvingInvites(prev => { const next = { ...prev }; delete next[n.id]; return next; });
    }
  };

  const fetchNotifications = useCallback(async (reset = false) => {
    const newOffset = reset ? 0 : offset;
    try {
      const res = await fetch(`/api/notifications?limit=50&offset=${newOffset}`);
      if (res.ok) {
        const data = await res.json();
        const list = data.notifications || [];
        if (reset) {
          setNotifications(list);
        } else {
          setNotifications(prev => [...prev, ...list]);
        }
        setUnread(data.unread || 0);
        setHasMore(list.length === 50);
        if (reset) setOffset(50);
        else setOffset(prev => prev + 50);
        setLoading(false);
        return list;
      }
    } catch {}
    setLoading(false);
  }, [offset]);

  useEffect(() => {
    if (user) {
      fetchNotifications(true).then(list => {
        if (list) {
          // Viewing the notifications page counts as having seen them, so
          // tell the navbar to clear its badge. Read state remains independent,
          // so this page can still offer "Mark all as read".
          dispatchNotificationsUpdate(list.map(n => n.id));
        }
      });
    }
  }, [user]);

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setUnread(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    dispatchNotificationsUpdate();
  };

  const markRead = async (id) => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
    setUnread(prev => Math.max(0, prev - 1));
    dispatchNotificationsUpdate();
  };

  const toggleRead = async (id, read) => {
  await fetch('/api/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      read,
    }),
  });

  setNotifications(prev =>
    prev.map(n =>
      n.id === id
        ? { ...n, read: read ? 1 : 0 }
        : n
    )
  );

  setUnread(prev =>
    read
      ? Math.max(0, prev - 1)
      : prev + 1
  );
  dispatchNotificationsUpdate();
};

  if (authLoading) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="h-8 w-48 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
          <div className="mt-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <ion-icon name="notifications-outline" style={{ fontSize: '48px', color: 'var(--text-faint)' }} />
          <h2 className="text-xl font-bold mt-4" style={{ color: 'var(--text-primary)' }}>Sign in to view notifications</h2>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Your activity and updates will appear here.</p>
          <Link href="/sign-in" className="mt-6 px-6 py-2.5 bg-[#9b7bf7] text-white font-semibold rounded-full text-sm hover:bg-[#8b6ae6] transition-colors">
            Sign In
          </Link>
        </div>
      </AppShell>
    );
  }

  // Filter
  const filtered = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    if (filter === 'invite') return n.type === 'org_invite' || n.type === 'blog_invite';
    return n.type === filter;
  });

  const grouped = groupByDate(filtered);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</h1>
            {unread > 0 && (
              <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
                {unread} unread notification{unread !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="px-4 py-2 text-[13px] font-medium rounded-lg transition-colors"
              style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto scrollbar-none pb-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3.5 py-1.5 text-[13px] font-medium rounded-full transition-colors whitespace-nowrap"
              style={{
                backgroundColor: filter === f.key ? 'var(--accent)' : 'var(--bg-surface)',
                color: filter === f.key ? '#ffffff' : 'var(--text-muted)',
                border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border-default)'}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <ion-icon name="notifications-off-outline" style={{ fontSize: '48px', color: 'var(--text-faint)' }} />
            <p className="text-[15px] mt-4" style={{ color: 'var(--text-muted)' }}>
              {filter === 'all' ? 'No notifications yet' : `No ${filter === 'unread' ? 'unread' : filter} notifications`}
            </p>
            <p className="text-[13px] mt-1" style={{ color: 'var(--text-faint)' }}>
              When someone interacts with your content, you'll see it here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([label, items]) => (
              <div key={label}>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: 'var(--text-faint)' }}>
                  {label}
                </p>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                  {items.map((n, i) => {
                    const cfg = NOTIF_CONFIG[n.type] || NOTIF_CONFIG.follow;
                    const awardedBadge = n.type === 'badge_awarded' ? CREATOR_BADGE_MAP.get(n.target_id) : null;
                    return (
                      <Link
                        key={n.id}
                        href={n.target_url || '#'}
                        onClick={() => { if (!n.read) markRead(n.id); }}
                        className="flex items-start gap-3.5 px-5 py-4 transition-colors"
                        style={{
                          backgroundColor: n.read ? 'var(--card-bg)' : 'var(--accent-subtle)',
                          borderBottom: i < items.length - 1 ? '1px solid var(--divider)' : 'none',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = n.read ? 'var(--bg-hover)' : 'var(--accent-subtle)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = n.read ? 'var(--card-bg)' : 'var(--accent-subtle)'}
                      >
                        {/* Avatar + type badge */}
                        <div className="relative flex-shrink-0 mt-0.5">
                          {awardedBadge ? (
                            <CreatorBadgeMark badge={awardedBadge} size={42} />
                          ) : n.actor_avatar ? (
                            <img src={n.actor_avatar} alt="" className="h-10 w-10 rounded-full object-cover" style={{ border: '2px solid var(--border-default)' }} />
                          ) : (
                            <div className="h-10 w-10 rounded-full flex items-center justify-center text-[14px] font-bold"
                              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '2px solid var(--border-default)' }}>
                              {(n.actor_name || '?')[0].toUpperCase()}
                            </div>
                          )}
                          {!awardedBadge && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: 'var(--card-bg)', border: '2px solid var(--divider)' }}>
                              <ion-icon name={cfg.icon} style={{ fontSize: '11px', color: cfg.color }} />
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{n.actor_name || 'Someone'}</strong>
                            {' '}{cfg.label}
                            {n.target_title && (
                              <> <strong style={{ color: 'var(--text-primary)' }}>{n.target_title}</strong></>
                            )}
                          </p>
                          <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-faint)' }}>{timeAgo(n.created_at)}</p>

                          {n.type === 'blog_invite' && (
                            (resolvedInvites[n.id] || n.invite_status || 'pending') !== 'pending' ? (
                              <p className="text-[12px] mt-2 font-medium" style={{ color: (resolvedInvites[n.id] || n.invite_status) === 'accepted' ? '#4ade80' : 'var(--text-faint)' }}>
                                {(resolvedInvites[n.id] || n.invite_status) === 'accepted' ? 'Joined as collaborator' : 'Declined'}
                              </p>
                            ) : (
                              <div className="flex gap-2 mt-2.5">
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); respondInvite(n, true); }}
                                  className="px-3 py-1 text-[12px] font-semibold rounded-full text-white"
                                  style={{ backgroundColor: '#9b7bf7' }}
                                  disabled={!!resolvingInvites[n.id]}
                                >
                                  {resolvingInvites[n.id] ? 'Saving…' : 'Accept'}
                                </button>
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); respondInvite(n, false); }}
                                  className="px-3 py-1 text-[12px] font-medium rounded-full"
                                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
                                  disabled={!!resolvingInvites[n.id]}
                                >
                                  Decline
                                </button>
                              </div>
                            )
                          )}
                        </div>

                        {/* Unread indicator */}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleRead(n.id, !n.read);
                          }}
                          className="text-xs"
                          style={{ color: 'var(--accent)' }}
                        >
                          {n.read ? 'Mark unread' : 'Mark read'}
                        </button>
                        <div className="flex flex-col items-end gap-2">
                        {!n.read && (
                          <>
                            <div className="w-2.5 h-2.5 rounded-full bg-[#9b7bf7]" />
                          </>
                        )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="text-center pt-2">
                <button
                  onClick={() => fetchNotifications(false)}
                  className="px-5 py-2 text-[13px] font-medium rounded-lg transition-colors"
                  style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
