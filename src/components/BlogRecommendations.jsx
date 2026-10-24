'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { generateBlogThumbnail, generatePixelAvatar } from '../utils/pixelAvatar';

// Related first, then author-diversified; usable in end matter or the reader rail.
export default function BlogRecommendations({ blogId, compact = false, limit = 4 }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(Boolean(blogId));

  useEffect(() => {
    if (!blogId) {
      setPosts([]);
      setLoading(false);
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/blogs/${blogId}/recommendations`, {
      cache: 'force-cache',
      signal: controller.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d) setPosts(d.posts || []); })
      .catch(error => {
        if (active && error.name !== 'AbortError') setPosts([]);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [blogId]);

  if (loading) {
    const skeletonCount = Math.min(3, Math.max(1, limit));
    return (
      <div
        className={compact ? 'reader-rail-recommendations' : 'mt-12 border-t pt-8'}
        aria-label="Loading related stories"
        aria-busy="true"
      >
        <h3 className={compact ? 'reader-rail-heading' : 'mb-5 text-[16px] font-bold'}>More to read</h3>
        <div className={compact ? 'reader-rail-recommendation-list' : 'grid grid-cols-1 gap-5 sm:grid-cols-2'}>
          {Array.from({ length: skeletonCount }, (_, index) => (
            <div key={index} className={compact ? 'reader-rail-recommendation reader-rail-recommendation-skeleton' : 'flex gap-3 animate-pulse'} aria-hidden="true">
              <div className="reader-rail-skeleton-copy">
                <span className="reader-rail-skeleton-line reader-rail-skeleton-line-short" />
                <span className="reader-rail-skeleton-line" />
                <span className="reader-rail-skeleton-line reader-rail-skeleton-line-medium" />
              </div>
              <span className={compact ? 'reader-rail-recommendation-cover reader-rail-skeleton-cover' : 'h-[72px] w-[72px] shrink-0 rounded-md bg-[var(--bg-elevated)]'} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (posts.length === 0) return null;

  const visiblePosts = posts.slice(0, Math.max(1, limit));

  return (
    <div className={compact ? 'reader-rail-recommendations' : 'mt-12 pt-8'} style={compact ? undefined : { borderTop: '1px solid var(--divider)' }}>
      <h3 className={compact ? 'reader-rail-heading' : 'text-[16px] font-bold mb-5'} style={{ color: 'var(--text-primary)' }}>More to read</h3>
      <div className={compact ? 'reader-rail-recommendation-list' : 'grid grid-cols-1 sm:grid-cols-2 gap-5'}>
        {visiblePosts.map((p) => {
          const author = p.author || {};
          const href = `/${(p.org?.slug) || author.username || 'unknown'}/${p.slug}`;
          const cover = p.cover_image_r2_key || generateBlogThumbnail(p.id || p.slug);
          return (
            <Link key={p.id} href={href} className={compact ? 'reader-rail-recommendation group' : 'group flex gap-3'}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  <img src={author.avatar_url || generatePixelAvatar(author.username || author.display_name)} alt="" className="h-4 w-4 rounded-full object-cover" />
                  <span className="truncate">{p.org ? `In ${p.org.name}` : (author.display_name || author.username)}</span>
                </div>
                <p className="text-[15px] font-bold leading-[1.3] line-clamp-2 group-hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)', fontFamily: "'Source Serif 4', Georgia, serif" }}>{p.title || 'Untitled'}</p>
                {p.read_time_minutes > 0 && <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-faint)' }}>{p.read_time_minutes} min read</p>}
              </div>
              <img src={cover} alt="" className={compact ? 'reader-rail-recommendation-cover' : 'w-[72px] h-[72px] rounded-md object-cover flex-shrink-0 self-center'} style={{ backgroundColor: 'var(--bg-elevated)' }} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
