'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import AppShell from './components/AppShell';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { generateBlogThumbnail, generatePixelAvatar } from './utils/pixelAvatar';
import SearchBar from './components/SearchBar';
import { ONBOARDING_TIP_DAYS, tipForDay } from './utils/siteTips';

const TIP_STORAGE_KEY = 'lixblogs:onboarding-tip';
const ACTIONS_STORAGE_KEY = 'lixblogs:onboarding-actions';

const ONBOARDING_ACTIONS = [
  { label: 'Write a story', description: 'Start with an idea', href: '/new-blog', icon: 'create-outline', color: '#9b7bf7' },
  { label: 'Complete profile', description: 'Help readers know you', href: '/settings?tab=account', icon: 'person-circle-outline', color: '#3b82f6' },
  { label: 'Explore badges', description: 'See what you can earn', href: '/badges', icon: 'ribbon-outline', color: '#ec4899' },
  { label: 'Publishing basics', description: 'Know what works here', href: '/docs', icon: 'shield-checkmark-outline', color: '#10b981' },
];

function BrandIntro() {
  return (
    <section className="mx-6 mt-5 overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--card-bg)]" aria-labelledby="lixblogs-intro-title">
      <div className="bg-[radial-gradient(circle_at_90%_10%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent_36%),linear-gradient(135deg,var(--card-bg),var(--bg-surface))] px-6 py-8 sm:px-8 sm:py-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Open-source publishing</p>
        <h1 id="lixblogs-intro-title" className="mt-3 max-w-xl font-serif text-3xl font-extrabold leading-tight text-[var(--text-primary)] sm:text-4xl">
          Write once. Publish from anywhere.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--text-muted)] sm:text-[15px]">
          LixBlogs is an open-source blogging platform for writers, developers and teams. Create rich stories, collaborate live, and publish from the web, CLI or API.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/explore" className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white">Explore stories</Link>
          <Link href="/new-blog" className="rounded-full border border-[var(--border-default)] bg-[var(--bg-app)] px-5 py-2.5 text-sm font-bold text-[var(--text-secondary)]">Start writing</Link>
        </div>
        <nav aria-label="Learn about LixBlogs" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--divider)] pt-5 text-xs font-semibold text-[var(--text-muted)]">
          <Link href="/about" className="hover:text-[var(--accent)]">About the platform</Link>
          <Link href="/docs/cli" className="hover:text-[var(--accent)]">Publish with the CLI</Link>
          <Link href="/docs/api" className="hover:text-[var(--accent)]">Automate with the API</Link>
          <Link href="/contests" className="hover:text-[var(--accent)]">Writing contests</Link>
        </nav>
      </div>
    </section>
  );
}

function NewUserActions({ user, authLoading }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (authLoading || !user) {
      setVisible(false);
      return;
    }
    const createdAt = Number(user.created_at || 0);
    const ageDays = createdAt ? (Date.now() - createdAt * 1000) / 86_400_000 : 0;
    if (ageDays > ONBOARDING_TIP_DAYS) {
      localStorage.removeItem(ACTIONS_STORAGE_KEY);
      setVisible(false);
      return;
    }
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(ACTIONS_STORAGE_KEY) || 'null'); } catch {}
    setVisible(!(stored?.userId === user.id && stored?.dismissed));
  }, [authLoading, user]);

  if (!visible) return null;
  return (
    <section className="relative mb-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4" aria-label="Getting started">
      <div className="mb-3 flex items-start justify-between gap-4 pr-7">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Make LixBlogs yours</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">A few good places to begin.</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {ONBOARDING_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex min-w-[150px] flex-1 items-center gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-sm"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ color: action.color, backgroundColor: `color-mix(in srgb, ${action.color} 12%, transparent)` }}>
              <ion-icon name={action.icon} style={{ fontSize: '16px' }} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]" title={action.label}>{action.label}</span>
              <span className="block truncate text-[10px] text-[var(--text-faint)]" title={action.description}>{action.description}</span>
            </span>
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify({ userId: user.id, dismissed: true }));
          setVisible(false);
        }}
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)]"
        aria-label="Dismiss getting started"
      >
        <ion-icon name="close-outline" style={{ fontSize: '16px' }} />
      </button>
    </section>
  );
}

function DailyTipCard({ user, authLoading }) {
  const [dailyTip, setDailyTip] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    const createdAt = Number(user?.created_at || 0);
    if (createdAt) {
      const ageDays = (Date.now() - createdAt * 1000) / 86_400_000;
      if (ageDays > ONBOARDING_TIP_DAYS) {
        localStorage.removeItem(TIP_STORAGE_KEY);
        setDailyTip(null);
        return;
      }
    }

    const selected = tipForDay(user?.id || user?.username || 'guest');
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(TIP_STORAGE_KEY) || 'null'); } catch {}
    if (stored?.day === selected.day && stored?.dismissed) return;
    localStorage.setItem(TIP_STORAGE_KEY, JSON.stringify({ day: selected.day, dismissed: false }));
    setDailyTip(selected);
  }, [authLoading, user?.id, user?.username, user?.created_at]);

  if (!dailyTip) return null;
  return (
    <aside
      className="relative mb-4 overflow-hidden rounded-2xl px-5 py-4"
      style={{ background: 'linear-gradient(135deg, var(--accent-subtle), var(--bg-surface) 72%)', border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border-default))' }}
      aria-label="Tip of the day"
    >
      <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-10" style={{ backgroundColor: 'var(--accent)' }} />
      <div className="relative flex items-start gap-3 pr-8">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ color: 'var(--accent)', backgroundColor: 'var(--bg-surface)' }}>
          <ion-icon name="bulb-outline" style={{ fontSize: '17px' }} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>Tip of the day</p>
          <p className="mt-1 text-[13px] leading-5 break-words" style={{ color: 'var(--text-body)' }}>{dailyTip.tip}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(TIP_STORAGE_KEY, JSON.stringify({ day: dailyTip.day, dismissed: true }));
          setDailyTip(null);
        }}
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-hover)]"
        style={{ color: 'var(--text-faint)' }}
        aria-label="Dismiss today's tip"
      >
        <ion-icon name="close-outline" style={{ fontSize: '16px' }} />
      </button>
    </aside>
  );
}

function LiveContestFeedCard({ contest, additional = 0 }) {
  if (!contest) return null;
  const closes = contest.submissionsCloseAt
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(contest.submissionsCloseAt * 1000))
    : 'soon';
  const secondsLeft = Number(contest.submissionsCloseAt || 0) - Math.floor(Date.now() / 1000);
  const timeLeft = secondsLeft > 86400
    ? `${Math.ceil(secondsLeft / 86400)} days left`
    : `${Math.max(1, Math.ceil(secondsLeft / 3600))}h left`;
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] shadow-sm" aria-label="Live writing contest">
      <Link href={`/contests/${contest.slug}#enter-contest`} className="group grid grid-cols-[108px_minmax(0,1fr)] sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="relative min-h-40 overflow-hidden bg-[radial-gradient(circle_at_30%_30%,rgba(139,92,246,0.34),transparent_40%),linear-gradient(135deg,var(--bg-surface),var(--card-bg))]">
          {contest.coverUrl ? <img src={contest.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <span className="grid h-full place-items-center text-3xl text-[var(--accent)]"><ion-icon name="trophy-outline" /></span>}
          <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700 shadow-sm"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span>
        </div>
        <div className="flex min-w-0 flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Writing contest</p>{additional > 0 && <span className="text-[10px] font-semibold text-[var(--text-faint)]">+{additional} more live</span>}</div>
          <h2 className="mt-1.5 line-clamp-2 font-serif text-lg font-bold leading-6 text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{contest.title}</h2>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-muted)] sm:text-xs">{contest.description || contest.problemStatement}</p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3"><span className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--text-faint)]">{contest.organizer?.avatarUrl && <img src={contest.organizer.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />}<span className="truncate">@{contest.organizer?.username || 'host'} · ends {closes} · {timeLeft}</span></span><span className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-[10px] font-bold text-white">Enter now</span></div>
        </div>
      </Link>
    </section>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function AuthorStack({ authors }) {
  const shown = authors.slice(0, 3);
  return (
    <div className="flex -space-x-1.5">
      {shown.map((a, i) => (
        <img key={i} src={a.avatar_url || generatePixelAvatar(a.username || a.display_name)} alt="" title={a.display_name || a.username} className="h-5 w-5 rounded-full object-cover" style={{ boxShadow: '0 0 0 2px var(--bg-app)' }} />
      ))}
    </div>
  );
}

// "..." menu — follow author/publication, mute author/publication/topics, report.
function FeedCardMenu({ post, onHide }) {
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [fAuthor, setFAuthor] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [fOrg, setFOrg] = useState(false);
  const ref = useRef(null);
  const author = post.author || {};
  const org = post.org || null;
  const ownsPost = !!post.can_edit;
  const ownsAuthor = !!post.is_author || (!!user && post.author_id === user.id);
  const ownsPublication = !!org && ownsPost;

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Resolve current follow state when the menu opens, to grey out what's already followed.
  useEffect(() => {
    if (!open || !user) return;
    if (author.username) fetch(`/api/users/${author.username}/follow`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setFAuthor(!!d.following); setIsSelf(!!d.self); } }).catch(() => {});
    if (org?.slug) fetch(`/api/orgs/${org.slug}/follow`).then(r => r.ok ? r.json() : null).then(d => d && setFOrg(!!d.following)).catch(() => {});
  }, [open, user]);

  const needAuth = () => { if (!user) { window.location.href = '/sign-in?next=/'; return true; } return false; };
  const post_ = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});

  const followAuthor = () => { if (needAuth() || fAuthor) return; setFAuthor(true); post_(`/api/users/${author.username}/follow`); setOpen(false); };
  const followOrg = () => { if (needAuth() || fOrg) return; setFOrg(true); post_(`/api/orgs/${org.slug}/follow`); setOpen(false); };
  const showLess = () => {
    if (needAuth()) return;
    post_('/api/signals', { blogId: post.id, tags: post.tags || [], type: 'show_less', weight: -2 });
    if ((post.tags || []).length) {
      fetch('/api/users/me/interests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: post.tags }),
      }).catch(() => {});
    }
    setOpen(false);
    onHide?.(post.id);
  };
  const muteAuthor = () => { if (needAuth()) return; post_('/api/mutes', { targetType: 'author', targetId: post.author_id }); setOpen(false); onHide?.(post.id); };
  const muteOrg = () => { if (needAuth()) return; post_('/api/mutes', { targetType: 'org', targetId: org.id }); setOpen(false); onHide?.(post.id); };
  const muteTopics = () => { if (needAuth()) return; (post.tags || []).forEach(t => post_('/api/mutes', { targetType: 'tag', targetId: t, blogId: post.id })); setOpen(false); onHide?.(post.id); };
  const report = () => {
    if (needAuth()) return;
    setOpen(false);
    if (!confirm('Report this story to the moderators?')) return;
    post_(`/api/blogs/${post.id}/report`, { reason: 'other', detail: 'Reported from feed' });
  };

  const item = (label, fn, danger, badge, disabled) => (
    <button onClick={disabled ? undefined : fn} disabled={disabled} className="w-full text-left px-4 py-2 text-[13px] flex items-center gap-2 transition-colors"
      style={{ color: danger ? '#f87171' : 'var(--text-body)', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
      {label}{badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#16a34a', color: '#fff' }}>New</span>}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button onClick={(e) => { e.preventDefault(); setOpen(o => !o); }} className="flex items-center justify-center w-8 h-8 rounded-full transition-colors" style={{ color: 'var(--text-faint)' }} title="More" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
        <ion-icon name="ellipsis-horizontal" style={{ fontSize: '18px' }} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-56 rounded-xl py-1.5 overflow-hidden" style={{ backgroundColor: 'var(--dropdown-bg, var(--bg-surface))', border: '1px solid var(--border-default)', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
          {ownsPost ? (
            <>
              {item('Edit story', () => { window.location.href = `/edit/${post.slug || post.id}`; })}
              {item('Story settings', () => { window.location.href = `/edit/${post.slug || post.id}?panel=settings`; })}
              {ownsPublication && item('Publication settings', () => { window.location.href = `/settings/org/${org.slug}`; })}
            </>
          ) : (
            <>
              {!ownsAuthor && !isSelf && item(fAuthor ? `Following ${author.display_name || author.username}` : `Follow ${author.display_name || author.username}`, followAuthor, false, false, fAuthor)}
              {org && !ownsPublication && item(fOrg ? `Following ${org.name}` : `Follow ${org.name}`, followOrg, false, false, fOrg)}
              <div className="my-1.5" style={{ borderTop: '1px solid var(--divider)' }} />
              {item('Show less like this', showLess)}
              {!ownsAuthor && !isSelf && item('Mute author', muteAuthor)}
              {org && !ownsPublication && item('Mute publication', muteOrg)}
              {(post.tags || []).length > 0 && item('Mute topics', muteTopics, false, true)}
              <div className="my-1.5" style={{ borderTop: '1px solid var(--divider)' }} />
              {item('Report story…', report, true)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Action bar — like, comment, repost, save, "..." menu.
function FeedCardActions({ post, onHide }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(!!post.liked);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [saved, setSaved] = useState(!!post.bookmarked);
  const [reposted, setReposted] = useState(!!post.reposted);
  const [repostCount, setRepostCount] = useState(post.repost_count || 0);
  const [toast, setToast] = useState('');
  const href = feedPostHref(post);
  // Author / co-authors / org members can't repost their own blog.
  const cannotRepost = !!(post.is_author || post.is_co_author || post.can_edit);

  const guard = (fn) => (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!user) { window.location.href = '/sign-in?next=/'; return; }
    fn();
  };
  const like = guard(() => {
    const was = liked; setLiked(!was); setLikeCount(c => Math.max(0, c + (was ? -1 : 1)));
    fetch(`/api/blogs/${post.id}/like`, { method: 'POST' })
      .then(r => r.ok ? r.json() : Promise.reject()).then(d => { setLiked(!!d.liked); setLikeCount(d.count || 0); })
      .catch(() => { setLiked(was); setLikeCount(c => Math.max(0, c + (was ? 1 : -1))); });
  });
  const flashToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };
  const save = guard(() => {
    const was = saved; setSaved(!was);
    (was ? fetch(`/api/library/bookmarks/${post.id}`, { method: 'DELETE' })
         : fetch('/api/library/bookmarks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ blogId: post.id }) }))
      .then(r => { if (!r.ok) throw new Error(); if (!was) flashToast('Saved to your reading list'); }).catch(() => setSaved(was));
  });
  const repost = guard(() => {
    if (cannotRepost) return;
    const was = reposted; setReposted(!was); setRepostCount(c => Math.max(0, c + (was ? -1 : 1)));
    fetch(`/api/blogs/${post.id}/repost`, { method: was ? 'DELETE' : 'POST' })
      .then(r => r.ok ? r.json() : Promise.reject()).then(d => { setReposted(!!d.reposted); setRepostCount(d.count || 0); if (!was) flashToast('Reposted to your followers'); })
      .catch(() => { setReposted(was); setRepostCount(c => Math.max(0, c + (was ? 1 : -1))); });
  });

  return (
    <div className="flex items-center gap-5 mt-3">
      {/* like */}
      <button onClick={like} className="flex items-center gap-1.5 text-[13px] transition-colors" style={{ color: liked ? '#f43f5e' : 'var(--text-muted)' }} title={liked ? 'Unlike' : 'Like'}>
        <svg className="w-[18px] h-[18px]" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
        {likeCount > 0 && <span>{likeCount >= 1000 ? `${(likeCount / 1000).toFixed(1)}K` : likeCount}</span>}
      </button>
      {/* comments */}
      <Link href={`${href}#comments`} className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--text-muted)' }} title="Comments" onClick={e => e.stopPropagation()}>
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        {post.comment_count > 0 && <span>{post.comment_count}</span>}
      </Link>
      {/* repost — greyed/disabled on your own blog */}
      <button
        onClick={repost}
        disabled={cannotRepost}
        title={cannotRepost ? "You can't repost your own blog" : 'Repost'}
        className="flex items-center gap-1.5 text-[13px] transition-colors"
        style={{ color: reposted ? '#16a34a' : 'var(--text-muted)', opacity: cannotRepost ? 0.4 : 1, cursor: cannotRepost ? 'not-allowed' : 'pointer' }}
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
        {repostCount > 0 && <span>{repostCount}</span>}
      </button>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={save} className="flex items-center justify-center w-8 h-8 rounded-full transition-colors" style={{ color: saved ? '#9b7bf7' : 'var(--text-faint)' }} title="Save to reading list" onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
          <ion-icon name={saved ? 'bookmark' : 'bookmark-outline'} style={{ fontSize: '18px' }} />
        </button>
        <FeedCardMenu post={post} onHide={onHide} />
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-app)', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
          <ion-icon name="bookmark" style={{ fontSize: '15px' }} /> {toast}
        </div>
      )}
    </div>
  );
}

function FeedCard({ post, onHide }) {
  const cardRef = useRef(null);
  const author = post.author || {};
  const cover = post.cover_image_r2_key || generateBlogThumbnail(post.id || post.slug);
  const href = feedPostHref(post);
  const allAuthors = [{ display_name: author.display_name, username: author.username, avatar_url: author.avatar_url }, ...(post.co_authors || [])];

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !post.id || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: post.id, eventType: 'impression', referrer: window.location.href }),
        keepalive: true,
      }).catch(() => {});
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(card);
    return () => observer.disconnect();
  }, [post.id]);

  return (
    <article ref={cardRef} className="group py-6" style={{ borderBottom: '1px solid var(--divider)' }}>
      {post.reshared_by && (
        <div className="flex items-center gap-1.5 mb-2 text-[12px] font-medium" style={{ color: 'var(--text-faint)' }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>
          Reposted by {post.reshared_by.display_name || post.reshared_by.username}
        </div>
      )}
      {!post.reshared_by && post.recommendation_reason?.[0] && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--text-faint)' }}>
          <ion-icon name="sparkles-outline" /> Suggested · {post.recommendation_reason[0]}
        </div>
      )}
      <Link href={href} className="flex gap-5 cursor-pointer">
        <div className="flex-1 min-w-0">
          {(() => {
            const names = allAuthors.slice(0, 3).map(a => a.display_name || a.username);
            const moreN = allAuthors.length - names.length;
            const namesStr = names.join(' and ') + (moreN > 0 ? ` + ${moreN} more` : '');
            const dateStr = post.published_at ? new Date(post.published_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            return (
              <div className="flex items-center gap-2 mb-2 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
                <AuthorStack authors={allAuthors} />
                <span className="truncate">
                  {post.org && <>in <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{post.org.name}</span> </>}
                  by <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{namesStr}</span>
                  {dateStr && <span style={{ color: 'var(--text-faint)' }}> · {dateStr}</span>}
                </span>
                {post.is_staff && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: '#9b7bf718', color: '#9b7bf7', border: '1px solid #9b7bf730' }}>Staff</span>
                )}
                {post.discovery_label && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: post.discovery_label === 'Rising' ? '#f59e0b18' : '#10b98118', color: post.discovery_label === 'Rising' ? '#d97706' : '#059669', border: `1px solid ${post.discovery_label === 'Rising' ? '#f59e0b35' : '#10b98135'}` }}>
                    {post.discovery_label}
                  </span>
                )}
              </div>
            );
          })()}

          <h2 className="text-[20px] font-extrabold leading-[1.25] mb-1 group-hover:opacity-80 transition-opacity tracking-[-0.01em]" style={{ color: 'var(--text-primary)', fontFamily: "'Source Serif 4', Georgia, serif" }}>
            {post.title || 'Untitled'}
          </h2>
          {post.subtitle && (
            <p className="text-[15px] font-medium leading-[1.5] line-clamp-1 mb-1" style={{ color: 'var(--text-muted)' }}>{post.subtitle}</p>
          )}
          {post.excerpt && (
            <p className="text-[14px] leading-[1.55] line-clamp-2 mb-2" style={{ color: 'var(--text-faint)' }}>{post.excerpt}</p>
          )}
          <div className="flex items-center gap-3 text-[13px]" style={{ color: 'var(--text-faint)' }}>
            {(post.tags || []).slice(0, 1).map(tag => (
              <span key={tag} className="text-[12px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-body)' }}>{tag}</span>
            ))}
            {post.read_time_minutes > 0 && <span>{post.read_time_minutes} min read</span>}
          </div>
        </div>

        <div className="flex-shrink-0 self-center hidden sm:block">
          <img src={cover} alt="" className="w-[112px] h-[112px] rounded-md object-cover" style={{ backgroundColor: 'var(--bg-elevated)' }} />
        </div>
      </Link>

      {/* Action bar */}
      <FeedCardActions post={post} onHide={onHide} />

      {post.can_edit && (
        <div className="mt-3 flex items-center gap-2">
          <Link href={`/edit/${post.slug || post.id}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors" style={{ color: 'var(--text-faint)', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            <ion-icon name="create-outline" style={{ fontSize: '13px' }} /> Edit
          </Link>
        </div>
      )}
    </article>
  );
}

function TopPickCard({ post, index }) {
  const author = post.author || {};
  const gradients = [
    'linear-gradient(135deg, rgba(155,123,247,0.1) 0%, rgba(96,165,250,0.06) 100%)',
    'linear-gradient(135deg, rgba(96,165,250,0.1) 0%, rgba(74,222,128,0.06) 100%)',
    'linear-gradient(135deg, rgba(244,114,182,0.1) 0%, rgba(155,123,247,0.06) 100%)',
  ];
  const accents = ['#9b7bf7', '#60a5fa', '#f472b6'];
  return (
    <Link href={feedPostHref(post)}>
      <div
        className="p-3.5 rounded-xl cursor-pointer group mb-2.5 transition-all duration-200 hover:scale-[1.02]"
        style={{
          background: gradients[index % 3],
          border: `1px solid color-mix(in srgb, ${accents[index % 3]} 15%, transparent)`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <img src={author.avatar_url || generatePixelAvatar(author.username || author.display_name)} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-white/10" />
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
            {author.display_name || author.username}
          </span>
          <span className="ml-auto text-[10px]" style={{ color: 'var(--text-faint)' }}>{timeAgo(post.published_at)}</span>
        </div>
        <h3 className="text-[13.5px] font-bold leading-[1.35] group-hover:opacity-80 transition-opacity font-serif" style={{ color: 'var(--text-primary)' }}>
          {post.title || 'Untitled'}
        </h3>
        {post.read_time_minutes > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            <div className="h-[3px] flex-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, post.read_time_minutes * 20)}%`, backgroundColor: accents[index % 3], opacity: 0.5 }} />
            </div>
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{post.read_time_minutes} min</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function FollowSuggestion({ u }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  // Reflect the real follow state so the button isn't always "Follow".
  useEffect(() => {
    if (!user || !u.username) return;
    let active = true;
    fetch(`/api/users/${encodeURIComponent(u.username)}/follow`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d) setFollowing(!!d.following); })
      .catch(() => {});
    return () => { active = false; };
  }, [u.username, user]);
  const toggle = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!user) { window.location.href = `/sign-in?next=/`; return; }
    const was = following;
    setFollowing(!was);
    fetch(`/api/users/${encodeURIComponent(u.username)}/follow`, { method: was ? 'DELETE' : 'POST' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setFollowing(!!d.following))
      .catch(() => setFollowing(was));
  };
  return (
    <div className="flex items-center gap-2.5 mb-3.5">
      <Link href={`/${u.username}`} className="flex-shrink-0">
        <img src={u.avatar_url || generatePixelAvatar(u.username || u.display_name)} alt="" className="h-9 w-9 rounded-full object-cover" />
      </Link>
      <Link href={`/${u.username}`} className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{u.display_name || u.username}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>@{u.username}</p>
      </Link>
      <button
        onClick={toggle}
        className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-colors flex-shrink-0"
        style={following
          ? { color: 'var(--text-muted)', border: '1px solid var(--border-default)' }
          : { color: 'var(--text-primary)', border: '1px solid var(--text-primary)' }}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-6 py-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="animate-pulse" style={{ borderBottom: '1px solid var(--divider)', paddingBottom: '24px' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }} />
            <div className="h-3 w-32 rounded" style={{ backgroundColor: 'var(--bg-elevated)' }} />
          </div>
          <div className="flex gap-6">
            <div className="flex-1">
              <div className="h-5 w-3/4 rounded mb-2" style={{ backgroundColor: 'var(--bg-elevated)' }} />
              <div className="h-4 w-full rounded mb-2" style={{ backgroundColor: 'var(--bg-elevated)' }} />
              <div className="h-3 w-1/3 rounded" style={{ backgroundColor: 'var(--bg-elevated)' }} />
            </div>
            <div className="w-[120px] h-[80px] rounded-md hidden sm:block" style={{ backgroundColor: 'var(--bg-elevated)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const FIXED_TAGS = ['Tech', 'Finance', 'Sports', 'Entertainment'];
const FEED_REQUEST_TTL_MS = 5_000;
const feedRequests = new Map();

function fetchFeedOnce(url) {
  const now = Date.now();
  const cached = feedRequests.get(url);
  if (cached && now - cached.startedAt < FEED_REQUEST_TTL_MS) return cached.promise;

  const promise = fetch(url, { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error(`Feed request failed (${response.status})`);
    return response.json();
  });
  feedRequests.set(url, { promise, startedAt: now });
  return promise;
}

function recommendedTopics(interests, popular) {
  const seen = new Set();
  const topics = [];
  const interestSet = new Set(interests.map(tag => String(tag).trim().toLowerCase()));

  const add = (tag, count = 0) => {
    const value = String(tag || '').trim();
    const key = value.toLowerCase();
    if (!key || seen.has(key) || topics.length >= 10) return;
    seen.add(key);
    topics.push({ tag: value, count: Number(count) || 0, personal: interestSet.has(key) });
  };

  interests.forEach(tag => add(tag));
  popular.forEach(topic => add(topic.tag, topic.count));
  FIXED_TAGS.forEach(tag => add(tag));
  return topics;
}

function feedPostHref(post) {
  const owner = post.org?.slug || post.author?.username || 'unknown';
  const parts = [owner];
  if (post.org?.slug && post.collection?.slug) parts.push(post.collection.slug);
  parts.push(post.slug);
  return `/${parts.map(part => encodeURIComponent(part)).join('/')}`;
}

export default function App({ initialPosts = [], showBrandIntro = false }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id || null;
  const isSignedIn = Boolean(userId);
  const [posts, setPosts] = useState(initialPosts);
  const [topPicks, setTopPicks] = useState([]);
  const [popularTags, setPopularTags] = useState([]);
  const [userInterests, setUserInterests] = useState([]);
  const [liveContests, setLiveContests] = useState([]);
  const [loading, setLoading] = useState(initialPosts.length === 0);
  const [activeTopic, setActiveTopic] = useState(0);
  const [tagFilter, setTagFilter] = useState(null); // active Recommended-topic pill
  const firstFeedLoadRef = useRef(true);
  const hasServerStoriesRef = useRef(initialPosts.length > 0);

  // Two tabs only: "For you" (personalized/blended) and "Featured" (editorial).
  const topics = [
    { label: 'For you', icon: 'sparkles', filter: null },
    { label: 'Featured', icon: null, filter: 'featured' },
  ];

  // "Who to follow" — distinct authors from the current feed (not you).
  const whoToFollow = (() => {
    const seen = new Set();
    const out = [];
    for (const p of posts) {
      const a = p.author;
      if (a?.username && a.username !== user?.username && a.username !== 'selenium-cutlet' && !seen.has(a.username)) {
        seen.add(a.username);
        out.push(a);
      }
      if (out.length >= 4) break;
    }
    return out;
  })();

  // Fetch feed — a Recommended-topic pill (tagFilter) overrides the tab.
  useEffect(() => {
    // Waiting for auth prevents an anonymous request immediately followed by the
    // same request again for the resolved account. `fetchFeedOnce` also absorbs
    // React's development effect replay without hiding the server-rendered feed.
    if (authLoading) return undefined;
    const preserveServerStories = firstFeedLoadRef.current
      && hasServerStoriesRef.current
      && !tagFilter
      && activeTopic === 0;
    if (preserveServerStories) {
      firstFeedLoadRef.current = false;
      return undefined;
    }
    setLoading(true);
    let url = '/api/feed?limit=20';
    if (tagFilter) url += `&tag=${encodeURIComponent(tagFilter)}`;
    else if (topics[activeTopic]?.filter) url += `&filter=${topics[activeTopic].filter}`;

    let active = true;
    fetchFeedOnce(url)
      .then(data => { if (active) setPosts(data.posts || []); })
      .catch(() => { if (active) setPosts([]); })
      .finally(() => {
        if (!active) return;
        firstFeedLoadRef.current = false;
        setLoading(false);
      });
    return () => { active = false; };
  }, [activeTopic, authLoading, isSignedIn, tagFilter]);

  // Fetch sidebar data once
  useEffect(() => {
    if (authLoading) return;
    fetch('/api/feed/trending?limit=3').then(r => r.json()).then(d => setTopPicks(d.posts || [])).catch(() => {});
    fetch('/api/tags/popular?limit=12').then(r => r.json()).then(d => setPopularTags(d.tags || [])).catch(() => {});
    fetch('/api/contests', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => setLiveContests((d?.contests || []).filter(contest => contest.status === 'live').slice(0, 4))).catch(() => {});
    if (isSignedIn) {
      fetch('/api/users/me/interests').then(r => r.json()).then(d => setUserInterests(d.interests || [])).catch(() => {});
    }
  }, [authLoading, isSignedIn]);

  const topicSuggestions = recommendedTopics(userInterests, popularTags);

  return (
    <AppShell>
      <div className="flex justify-center">
        {/* Center Feed */}
        <div className="w-full max-w-[740px] min-w-0" style={{ borderRight: '1px solid var(--divider)' }}>
          {showBrandIntro && <BrandIntro />}
          {/* Search + Topic Tabs — sticky header */}
          <div className="sticky top-14 z-40 backdrop-blur-md" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-app) 92%, transparent)', borderBottom: '1px solid var(--divider)' }}>
            <div className="max-w-[680px] mx-auto">
            {/* Search bar */}
            <div className="px-6 pt-3 pb-2">
              <SearchBar />
            </div>
            {/* Topic tabs */}
            <div className="flex items-center gap-0 px-6 overflow-x-auto scrollbar-none">
              {topics.map((topic, i) => (
                <button
                  key={topic.label}
                  onClick={() => { setTagFilter(null); setActiveTopic(i); }}
                  className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0"
                  style={{
                    color: !tagFilter && i === activeTopic ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderBottomColor: !tagFilter && i === activeTopic ? 'var(--text-primary)' : 'transparent',
                  }}
                >
                  {topic.icon && <ion-icon name={topic.icon} style={{ fontSize: '14px' }} />}
                  {topic.label}
                </button>
              ))}
            </div>
            </div>
          </div>

          {/* Feed */}
          <div className="px-6 pt-4 max-w-[680px] mx-auto">
            <NewUserActions user={user} authLoading={authLoading} />
            {!tagFilter && activeTopic === 0 && liveContests.length > 0 && <LiveContestFeedCard contest={liveContests[0]} additional={liveContests.length - 1} />}
            <DailyTipCard user={user} authLoading={authLoading} />
            {tagFilter && (
              <div className="flex items-center gap-2 mb-1 py-2">
                <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Topic:</span>
                <span className="text-[13px] font-semibold px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}>{tagFilter}</span>
                <button onClick={() => setTagFilter(null)} className="text-[12px]" style={{ color: 'var(--text-faint)' }}>✕ clear</button>
              </div>
            )}
            {loading ? (
              <FeedSkeleton />
            ) : posts.length > 0 ? (
              posts.map(post => <FeedCard key={post.id} post={post} onHide={(id) => setPosts(ps => ps.filter(p => p.id !== id))} />)
            ) : (
              <div className="my-8 rounded-2xl border border-dashed flex flex-col items-center text-center px-6 py-14" style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-surface)' }}>
                <div className="h-14 w-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <ion-icon name="document-text-outline" style={{ fontSize: '24px', color: 'var(--text-faint)' }} />
                </div>
                <p className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)' }}>No posts yet</p>
                <p className="text-[13px] mt-1.5 max-w-xs" style={{ color: 'var(--text-muted)' }}>
                  {user ? 'Follow writers or pick topics you like to fill your feed.' : 'Be the first to publish something.'}
                </p>
                {user && (
                  <Link href="/new-blog" className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 text-[14px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] rounded-full transition-colors">
                    <ion-icon name="create-outline" style={{ fontSize: '16px' }} />
                    Start writing
                  </Link>
                )}
              </div>
            )}
            {posts.length > 0 && !tagFilter && (
              <div className="py-8 text-center">
                <Link
                  href="/explore"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] px-5 py-2.5 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
                >
                  Browse all stories
                  <ion-icon name="arrow-forward-outline" style={{ fontSize: '15px' }} />
                </Link>
              </div>
            )}
            <div className="flex justify-center px-6 pb-8 pt-2">
              <a
                href="https://launchaf.com/"
                target="_blank"
                rel="noopener"
                data-launchaf-badge="true"
                className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-app)]"
              >
                <img
                  src="https://launchaf.com/api/badge/light?v=launchaf-blue-2026-2"
                  alt="Featured on LaunchAF"
                  width="200"
                  height="56"
                  className="h-auto max-w-full"
                />
              </a>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="hidden xl:block w-[340px] flex-shrink-0 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto px-8 py-6 scrollbar-none">
          {/* Top Picks */}
          <div className="mb-8">
            <h3 className="text-[13px] font-bold pb-2 mb-3 tracking-wider uppercase flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <ion-icon name="trophy-outline" style={{ fontSize: '14px', color: '#9b7bf7' }} />
              Top Picks
            </h3>
            {topPicks.length > 0 ? (
              <div>
                {topPicks.map((pick, i) => <TopPickCard key={pick.id} post={pick} index={i} />)}
              </div>
            ) : (
              <p className="text-[13px] py-4" style={{ color: 'var(--text-faint)' }}>No picks yet</p>
            )}
          </div>

          {/* Recommended Topics */}
          <div
            className="mb-8 rounded-2xl p-4"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}
              >
                <ion-icon name="pricetags-outline" style={{ fontSize: '18px' }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Recommended Topics</h3>
                <p className="text-[11px] leading-4 mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  {userInterests.length > 0 ? 'Your interests, mixed with what readers follow.' : 'Popular subjects from across LixBlogs.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {topicSuggestions.map(({ tag, count, personal }) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(current => current?.toLowerCase() === tag.toLowerCase() ? null : tag)}
                  className="group/topic inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                  style={tagFilter?.toLowerCase() === tag.toLowerCase()
                    ? { color: 'white', backgroundColor: 'var(--accent)', border: '1px solid var(--accent)', boxShadow: '0 4px 14px color-mix(in srgb, var(--accent) 25%, transparent)' }
                    : { color: 'var(--text-body)', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-default)' }}
                  aria-pressed={tagFilter?.toLowerCase() === tag.toLowerCase()}
                  title={count > 0 ? `${count} ${count === 1 ? 'story' : 'stories'}` : `Browse ${tag}`}
                >
                  <span style={{ opacity: 0.55 }}>#</span>
                  <span className="capitalize">{tag}</span>
                  {personal && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: tagFilter?.toLowerCase() === tag.toLowerCase() ? 'white' : 'var(--accent)' }}
                      title="One of your interests"
                    />
                  )}
                </button>
              ))}
            </div>

            {tagFilter && (
              <button
                onClick={() => setTagFilter(null)}
                className="mt-3 text-[11px] font-medium hover:opacity-70 transition-opacity"
                style={{ color: 'var(--text-muted)' }}
              >
                Clear topic filter
              </button>
            )}
          </div>

          {/* Who to follow */}
          {whoToFollow.length > 0 && (
            <div className="mb-8">
              <h3 className="text-[14px] font-bold mb-4 tracking-wide" style={{ color: 'var(--text-primary)' }}>Who to follow</h3>
              {whoToFollow.map(u => <FollowSuggestion key={u.username} u={u} />)}
            </div>
          )}

          {/* Writing Prompt */}
          <div className="rounded-xl p-5" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <h3 className="text-[14px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Writing on LixBlogs</h3>
            <ul className="text-[13px] space-y-1.5 mt-3" style={{ color: 'var(--text-muted)' }}>
              <li><Link href="/elixpo/guides/getting-started" className="hover:opacity-70 transition-opacity">New to LixBlogs? Start here</Link></li>
              <li><Link href="/elixpo/guides/writing-tips" className="hover:opacity-70 transition-opacity">Read LixBlogs writing tips</Link></li>
              <li><Link href="/elixpo/guides/practical-advice" className="hover:opacity-70 transition-opacity">Get practical writing advice</Link></li>
            </ul>
            <Link
              href="/new-blog"
              className="inline-block mt-4 px-5 py-2 text-[13px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] rounded-full transition-colors"
            >
              Start writing
            </Link>
          </div>

          {/* Status — help/legal/docs now live in the left sidebar above the account */}
          <div className="mt-8 flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-faint)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#16a34a' }} />
            <span>All systems operational</span>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
