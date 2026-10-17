'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';
import TabBar from '../components/TabBar';
import ImageCropModal from '../components/ImageCropModal';
import FollowListModal from '../components/FollowListModal';
import Link from 'next/link';
import BadgeManager from '../components/BadgeManager';
import { generatePixelAvatar, generateProfileBanner } from '../utils/pixelAvatar';

function UsageBar({ label, used, limit, unit, color = '#9b7bf7' }) {
  const percent = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] text-[var(--text-body)]">{label}</span>
        <span className="text-[13px] text-[var(--text-primary)] font-medium">
          {used}{unit ? ` ${unit}` : ''} <span className="text-[var(--text-faint)]">/ {limit}{unit ? ` ${unit}` : ''}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, background: percent > 85 ? '#f87171' : color }}
        />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading, refetchUser } = useAuth();
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [localBanner, setLocalBanner] = useState(null);
  const [bannerError, setBannerError] = useState(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [localAvatar, setLocalAvatar] = useState(null);
  const [avatarError, setAvatarError] = useState(null);
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [blogs, setBlogs] = useState([]);
  const [coAuthored, setCoAuthored] = useState([]);
  const [blogsLoading, setBlogsLoading] = useState(true);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [followModal, setFollowModal] = useState(null); // 'followers' | 'following'
  const [blogActionId, setBlogActionId] = useState('');
  const [blogActionError, setBlogActionError] = useState('');
  const [shareFeedback, setShareFeedback] = useState('');

  useEffect(() => {
    if (!user?.username) return;
    // Real follower/following counts come from the profile resolver.
    fetch(`/api/resolve?name=${encodeURIComponent(user.username)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) setCounts({ followers: d.user.followers || 0, following: d.user.following || 0 });
      })
      .catch(() => {});
  }, [user?.username]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/tier/usage')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUsage(data); })
      .catch(() => {})
      .finally(() => setUsageLoading(false));
  }, [user]);

  async function manageOwnedBlog(blog, action) {
    const messages = {
      unlist: 'Remove this blog from feeds while keeping its public link?',
      archive: 'Archive this blog? It will no longer be publicly available.',
      delete: 'Permanently delete this blog and its stored media? This cannot be undone.',
    };
    if (!window.confirm(messages[action])) return;
    setBlogActionId(blog.id);
    setBlogActionError('');
    try {
      const response = action === 'delete'
        ? await fetch(`/api/blogs/${encodeURIComponent(blog.id)}`, { method: 'DELETE' })
        : await fetch(`/api/blogs/${encodeURIComponent(blog.id)}/manage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'The blog could not be updated');
      if (action === 'delete' || action === 'archive') {
        setBlogs((current) => current.filter((item) => item.id !== blog.id));
      } else {
        setBlogs((current) => current.map((item) => item.id === blog.id ? { ...item, status: result.status } : item));
      }
    } catch (requestError) {
      setBlogActionError(requestError.message || 'The blog could not be updated');
    } finally {
      setBlogActionId('');
    }
  }

  function publicProfileUrl() {
    return new URL(`/${encodeURIComponent(user.username)}`, window.location.origin).toString();
  }

  async function copyProfileLink(fallbackMessage = 'Profile link copied.') {
    if (!user?.username) return false;
    const url = publicProfileUrl();
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {}

    if (!copied) {
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', '');
      input.setAttribute('aria-hidden', 'true');
      input.tabIndex = -1;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try {
        copied = document.execCommand('copy');
      } catch {}
      input.remove();
    }

    setShareFeedback(copied ? fallbackMessage : 'Could not copy the link. Open your public profile to copy its URL.');
    return copied;
  }

  async function shareProfile() {
    if (!user?.username) return;
    const url = publicProfileUrl();
    if (typeof navigator.share !== 'function') {
      await copyProfileLink('Sharing is unavailable; profile link copied.');
      return;
    }

    try {
      await navigator.share({
        title: `${user.display_name || user.username} on LixBlogs`,
        url,
      });
      setShareFeedback('Profile shared.');
    } catch (error) {
      if (error?.name === 'AbortError') {
        setShareFeedback('Sharing canceled.');
        return;
      }
      const copied = await copyProfileLink('Sharing failed; profile link copied instead.');
      if (!copied) setShareFeedback('Sharing failed. Use Copy link to try again.');
    }
  }

  async function leaveCoauthoredBlog(blog) {
    if (!window.confirm(`Remove yourself as a co-author from “${blog.title || 'Untitled'}”?`)) return;
    setBlogActionId(blog.id);
    setBlogActionError('');
    try {
      const response = await fetch('/api/blogs/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugid: blog.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'You could not leave this blog');
      setCoAuthored((current) => current.filter((item) => item.id !== blog.id));
    } catch (requestError) {
      setBlogActionError(requestError.message || 'You could not leave this blog');
    } finally {
      setBlogActionId('');
    }
  }

  useEffect(() => {
    if (!user) return;
    fetch('/api/blogs/list')
      .then(r => r.ok ? r.json() : { blogs: [] })
      .then(d => setBlogs(d.blogs || []))
      .catch(() => {})
      .finally(() => setBlogsLoading(false));
    fetch('/api/blogs/list?filter=coauthored')
      .then(r => r.ok ? r.json() : { blogs: [] })
      .then(d => setCoAuthored(d.blogs || []))
      .catch(() => {});
  }, [user]);

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="h-48 rounded-xl bg-[var(--bg-elevated)] animate-pulse mb-20" />
          <div className="h-6 w-48 bg-[var(--bg-elevated)] animate-pulse rounded mb-3" />
          <div className="h-4 w-32 bg-[var(--bg-elevated)] animate-pulse rounded mb-6" />
          <div className="h-16 w-full bg-[var(--bg-elevated)] animate-pulse rounded" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Sign in to view your profile</h2>
          <p className="text-[var(--text-muted)] text-sm mb-6">Your profile, blogs, and activity will appear here.</p>
          <Link href="/sign-in" className="px-6 py-2.5 bg-[#9b7bf7] text-[var(--text-primary)] font-semibold rounded-full text-sm hover:bg-[#b69aff] transition-colors">
            Sign In
          </Link>
        </div>
      </AppShell>
    );
  }

  // Banners overwrite a stable Cloudinary public id. Version the proxy URL so a
  // replacement cannot be served from the browser/CDN cache after a reload.
  const uploadedBannerSrc = user.banner_r2_key
    ? `/api/media/${user.banner_r2_key}?v=${encodeURIComponent(user.updated_at || '')}`
    : null;
  const defaultSeed = user.username || user.id || 'lixblogs-user';
  const bannerSrc = localBanner || uploadedBannerSrc || generateProfileBanner(defaultSeed, user.avatar_url);

  async function handleBannerSave(blob) {
    if (!blob) {
      // Remove → clear server-side and return to the generated default.
      setShowBannerModal(false);
      setBannerError(null);
      try {
        const res = await fetch('/api/media/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'banner' }),
        });
        if (!res.ok) throw new Error('Failed to remove banner');
        setLocalBanner(null);
        await refetchUser?.();
      } catch (e) {
        setBannerError(e?.message || 'Failed to remove banner');
      }
      return;
    }

    // Optimistic preview while we upload.
    const previewUrl = URL.createObjectURL(blob);
    setLocalBanner(previewUrl);
    setShowBannerModal(false);
    setBannerError(null);

    try {
      const form = new FormData();
      form.append('file', blob, 'banner.webp');
      form.append('type', 'banner');
      const res = await fetch('/api/media/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      // Persisted — swap the blob preview for the stored URL so it survives reloads.
      if (data.url) setLocalBanner(data.url);
    } catch (e) {
      setBannerError(e?.message || 'Failed to update banner');
      setLocalBanner(null); // revert optimistic preview
    } finally {
      URL.revokeObjectURL(previewUrl);
    }
  }

  const avatarSrc = localAvatar || user.avatar_url || generatePixelAvatar(defaultSeed);

  async function handleAvatarSave(blob) {
    if (!blob) {
      // Remove → revert to the generated geometric avatar.
      setShowAvatarModal(false);
      setAvatarError(null);
      try {
        const res = await fetch('/api/media/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'avatar' }),
        });
        if (!res.ok) throw new Error('Failed to remove photo');
        setLocalAvatar(null);
        await refetchUser?.();
      } catch (e) {
        setAvatarError(e?.message || 'Failed to remove photo');
      }
      return;
    }
    const previewUrl = URL.createObjectURL(blob);
    setLocalAvatar(previewUrl);
    setShowAvatarModal(false);
    setAvatarError(null);
    try {
      const form = new FormData();
      form.append('file', blob, 'avatar.webp');
      form.append('type', 'avatar');
      const res = await fetch('/api/media/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      if (data.url) setLocalAvatar(data.url);
    } catch (e) {
      setAvatarError(e?.message || 'Failed to update avatar');
      setLocalAvatar(null);
    } finally {
      URL.revokeObjectURL(previewUrl);
    }
  }

  const tierLabel = usage?.tier === 'member' ? 'Member' : 'Free';
  const tierColor = usage?.tier === 'member' ? '#a78bfa' : '#9ca3af';

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Banner + Avatar */}
        <div className="relative mb-16">
          <div className="group w-full h-48 rounded-xl bg-[var(--bg-elevated)] overflow-hidden relative">
	            <img src={bannerSrc} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => setShowBannerModal(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 px-4 py-2 bg-[#27232f]/90 rounded-lg text-[13px] text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm shadow-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
	                {localBanner || uploadedBannerSrc ? 'Change Banner' : 'Add Banner'}
              </span>
            </button>
          </div>
          {bannerError && (
            <div className="absolute top-2 right-2 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-500/15 text-red-400 border border-red-500/25">
              {bannerError}
            </div>
          )}
          <div className="absolute -bottom-12 left-6">
            <button
              onClick={() => setShowAvatarModal(true)}
              className="group/av relative h-24 w-24 rounded-full border-4 border-[var(--bg-app)] overflow-hidden block"
	              title={localAvatar || user.avatar_url ? 'Change photo' : 'Add photo'}
	            >
	              <img src={avatarSrc} alt="" className="h-full w-full rounded-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/av:bg-black/45 transition-colors">
                <ion-icon name="camera-outline" style={{ fontSize: '22px', color: '#fff' }} className="opacity-0 group-hover/av:opacity-100 transition-opacity" />
              </span>
            </button>
            {avatarError && (
              <div className="absolute left-28 bottom-2 whitespace-nowrap px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                {avatarError}
              </div>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{user.display_name || user.username}</h1>
            <p className="text-[var(--text-muted)] text-sm mt-0.5">@{user.username}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Link
              href={`/${encodeURIComponent(user.username)}`}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[var(--text-body)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors"
            >
              <ion-icon name="eye-outline" aria-hidden="true" style={{ fontSize: '16px' }} />
              View Public Profile
            </Link>
            <button
              type="button"
              onClick={shareProfile}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[var(--text-body)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors"
              aria-label="Share public profile"
            >
              <ion-icon name="share-social-outline" aria-hidden="true" style={{ fontSize: '16px' }} />
              Share
            </button>
            <button
              type="button"
              onClick={() => copyProfileLink()}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[var(--text-body)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors"
              aria-label="Copy public profile link"
            >
              <ion-icon name="link-outline" aria-hidden="true" style={{ fontSize: '16px' }} />
              Copy link
            </button>
            <Link
              href="/settings"
              className="px-3 py-2 text-[12px] font-medium text-[var(--text-body)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-colors"
            >
              Edit Profile
            </Link>
            <Link
              href="/settings"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] hover:border-[var(--border-hover)] transition-colors"
              title="Settings"
              aria-label="Settings"
            >
              <ion-icon name="settings-outline" style={{ fontSize: '16px', color: 'var(--text-muted)' }} />
            </Link>
          </div>
        </div>
        {shareFeedback && (
          <p role="status" aria-live="polite" className="-mt-4 mb-6 text-right text-xs text-[var(--text-muted)]">
            {shareFeedback}
          </p>
        )}

        {user.bio && (
          <p className="text-[var(--text-secondary)] text-[15px] leading-relaxed mb-6">{user.bio}</p>
        )}

        <div className="flex items-center gap-6 text-[14px] text-[var(--text-muted)] mb-8">
          <button onClick={() => user?.username && setFollowModal('followers')} className="hover:text-[var(--text-primary)] transition-colors">
            <strong className="text-[var(--text-primary)]">{counts.followers}</strong> Followers
          </button>
          <button onClick={() => user?.username && setFollowModal('following')} className="hover:text-[var(--text-primary)] transition-colors">
            <strong className="text-[var(--text-primary)]">{counts.following}</strong> Following
          </button>
        </div>
        {followModal && (
          <FollowListModal username={user.username} type={followModal} onClose={() => setFollowModal(null)} />
        )}

        <div className="h-px bg-[var(--bg-elevated)] mb-8" />

        <BadgeManager />

        {/* Subscription & Usage */}
        <div className="mb-8">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mb-4">Subscription</h2>
          {usageLoading ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-5 space-y-3">
              <div className="h-5 w-28 bg-[var(--bg-elevated)] animate-pulse rounded" />
              <div className="h-2 w-full bg-[var(--bg-elevated)] animate-pulse rounded-full" />
              <div className="h-2 w-full bg-[var(--bg-elevated)] animate-pulse rounded-full" />
            </div>
          ) : usage ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-5 space-y-5">
              {/* Tier badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="px-3 py-1 rounded-full text-[12px] font-semibold uppercase tracking-wide"
                    style={{ background: `${tierColor}18`, color: tierColor, border: `1px solid ${tierColor}33` }}
                  >
                    {tierLabel}
                  </div>
                  <span className="text-[13px] text-[var(--text-muted)]">Current plan</span>
                </div>
                {usage.tier === 'free' && (
                  <button className="px-3 py-1.5 text-[12px] font-medium text-[#a78bfa] bg-[#a78bfa12] border border-[#a78bfa25] rounded-lg hover:bg-[#a78bfa20] transition-colors">
                    Upgrade
                  </button>
                )}
              </div>

              {/* AI usage */}
              <UsageBar
                label="AI requests today"
                used={usage.ai.used}
                limit={usage.ai.limit}
                color="#a78bfa"
              />

              {/* Storage */}
              <UsageBar
                label="Storage used"
                used={usage.storage.usedFormatted}
                limit={usage.storage.limitFormatted}
                color="#60a5fa"
              />

              {/* Limits summary */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                  <svg className="w-3.5 h-3.5 text-[var(--text-faint)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Co-authors: {usage.limits.coAuthorsPerBlog}/blog
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                  <svg className="w-3.5 h-3.5 text-[var(--text-faint)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Orgs: {usage.orgs.owned}/{usage.orgs.limit}
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                  <svg className="w-3.5 h-3.5 text-[var(--text-faint)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Images: {usage.limits.imagePerBlogFormatted}/blog
                </div>
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                  <svg className="w-3.5 h-3.5 text-[var(--text-faint)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI: {usage.ai.limit} req/day
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-5 text-[var(--text-secondary)]enter">
              <p className="text-[13px] text-[var(--text-muted)]">Unable to load subscription info</p>
            </div>
          )}
        </div>

        <div className="h-px bg-[var(--bg-elevated)] mb-8" />

        {(() => {
          const published = blogs.filter(b => b.status === 'published' || b.status === 'unlisted');
          const drafts = blogs.filter(b => b.status === 'draft');
          const list = activeTab === 0 ? published : activeTab === 1 ? drafts : coAuthored;
          const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          return (
            <>
              <TabBar
                tabs={[
                  { label: 'Published', icon: 'globe-outline', count: published.length },
                  { label: 'Drafts', icon: 'document-outline', count: drafts.length },
                  { label: 'Co-authored', icon: 'people-outline', count: coAuthored.length },
                ]}
                active={activeTab}
                onChange={setActiveTab}
              />

              {blogActionError && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{blogActionError}</p>}

              {blogsLoading ? (
                <div className="space-y-4 mt-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-[var(--bg-elevated)] animate-pulse rounded" />)}
                </div>
              ) : list.length > 0 ? (
                <div>
                  {list.map((b) => {
                    const href = activeTab === 0 ? `/${user.username}/${b.slug}`
                      : activeTab === 2 && ['published', 'unlisted'].includes(b.status)
                        ? `/${b.author_username}/${b.slug}`
                        : `/edit/${b.slug || b.id}`;
                    return (
                      <article key={b.id} className="flex flex-col gap-3 border-b border-[var(--border-default)] py-5 last:border-b-0 sm:flex-row sm:items-center">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {b.status === 'draft' && <span className="text-[11px] font-medium text-[#e8a840] bg-[#e8a84014] px-2 py-0.5 rounded-full">Draft</span>}
                            {b.status === 'unlisted' && <span className="text-[11px] font-medium text-[#60a5fa] bg-[#60a5fa14] px-2 py-0.5 rounded-full">Unlisted</span>}
                            <span className="text-[12px] text-[var(--text-muted)]">
                              {b.status === 'draft' ? (b.updated_at ? `Edited ${fmt(b.updated_at)}` : '') : fmt(b.published_at || b.updated_at)}
                            </span>
                          </div>
                          <Link href={href}>
                            <h3 className="text-[17px] font-bold leading-[1.35] mb-1 font-serif hover:opacity-75 transition-opacity" style={{ color: 'var(--text-primary)' }}>
                              {b.page_emoji ? `${b.page_emoji} ` : ''}{b.title || 'Untitled'}
                            </h3>
                          </Link>
                          {b.subtitle && <p className="text-[14px] text-[var(--text-muted)] line-clamp-2">{b.subtitle}</p>}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          {(activeTab !== 2 || ['editor', 'admin'].includes(b.co_author_role)) && (
                            <Link href={`/edit/${b.slug || b.id}`} className="rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-body)] hover:bg-[var(--bg-elevated)]">Edit</Link>
                          )}
                          {activeTab === 0 && b.status === 'published' && (
                            <button disabled={blogActionId === b.id} onClick={() => manageOwnedBlog(b, 'unlist')} className="rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] disabled:opacity-50">Unlist</button>
                          )}
                          {activeTab !== 2 && (
                            <button disabled={blogActionId === b.id} onClick={() => manageOwnedBlog(b, 'archive')} className="rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] disabled:opacity-50">Archive</button>
                          )}
                          {activeTab !== 2 && (
                            <button disabled={blogActionId === b.id} onClick={() => manageOwnedBlog(b, 'delete')} className="grid h-8 w-8 place-items-center rounded-lg border border-red-400/25 text-red-500 hover:bg-red-500/10 disabled:opacity-50" aria-label={`Delete ${b.title || 'blog'}`} title="Delete permanently"><ion-icon name="trash-outline" /></button>
                          )}
                          {activeTab === 2 && (
                            <button disabled={blogActionId === b.id} onClick={() => leaveCoauthoredBlog(b)} className="rounded-lg border border-red-400/25 px-2.5 py-1.5 text-[11px] font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50">Remove me</button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-[var(--text-muted)] text-sm">{activeTab === 0 ? 'No published blogs yet.' : activeTab === 2 ? "You haven't co-authored any posts yet." : 'No drafts yet.'}</p>
                  {activeTab !== 2 && (
                    <Link href="/new-blog" className="inline-block mt-4 px-5 py-2 text-[13px] font-medium text-[var(--text-primary)] bg-[#9b7bf7] hover:bg-[#b69aff] rounded-full transition-colors">
                      Write your first blog
                    </Link>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Banner crop + stylise */}
      {showBannerModal && (
        <ImageCropModal
          title="Edit banner"
          aspectRatio={16 / 5}
          outputWidth={1200}
          quality={0.55}
          maxSizeKB={90}
          currentImage={bannerSrc}
          onSave={handleBannerSave}
          onClose={() => setShowBannerModal(false)}
        />
      )}

      {/* Avatar crop + stylise (square, circular guide) */}
      {showAvatarModal && (
        <ImageCropModal
          title="Edit photo"
          aspectRatio={1}
          outputWidth={512}
          quality={0.7}
          maxSizeKB={40}
          round
          currentImage={avatarSrc}
          onSave={handleAvatarSave}
          onClose={() => setShowAvatarModal(false)}
        />
      )}
    </AppShell>
  );
}
