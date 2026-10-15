'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { generateBlogThumbnail, generatePixelAvatar } from '../utils/pixelAvatar';

// "More to read" under the comments — related first, then author-diversified.
export default function BlogRecommendations({ blogId }) {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!blogId) return;
    let active = true;
    fetch(`/api/blogs/${blogId}/recommendations`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d) setPosts(d.posts || []); })
      .catch(() => {});
    return () => { active = false; };
  }, [blogId]);

  if (posts.length === 0) return null;

  return (
    <div className="mt-12 pt-8" style={{ borderTop: '1px solid var(--divider)' }}>
      <h3 className="text-[16px] font-bold mb-5" style={{ color: 'var(--text-primary)' }}>More to read</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {posts.map((p) => {
          const author = p.author || {};
          const href = `/${(p.org?.slug) || author.username || 'unknown'}/${p.slug}`;
          const cover = p.cover_image_r2_key || generateBlogThumbnail(p.id || p.slug);
          return (
            <Link key={p.id} href={href} className="group flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  <img src={author.avatar_url || generatePixelAvatar(author.username || author.display_name)} alt="" className="h-4 w-4 rounded-full object-cover" />
                  <span className="truncate">{p.org ? `In ${p.org.name}` : (author.display_name || author.username)}</span>
                </div>
                <p className="text-[15px] font-bold leading-[1.3] line-clamp-2 group-hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)', fontFamily: "'Source Serif 4', Georgia, serif" }}>{p.title || 'Untitled'}</p>
                {p.read_time_minutes > 0 && <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-faint)' }}>{p.read_time_minutes} min read</p>}
              </div>
              <img src={cover} alt="" className="w-[72px] h-[72px] rounded-md object-cover flex-shrink-0 self-center" style={{ backgroundColor: 'var(--bg-elevated)' }} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
