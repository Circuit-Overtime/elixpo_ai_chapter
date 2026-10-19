import Link from 'next/link';
import { publicStoryPath } from '../../lib/publicDiscovery';

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp * 1000));
}

function fallbackCover(story) {
  const params = new URLSearchParams({
    type: 'blog',
    title: story.title || 'Untitled',
    subtitle: story.subtitle || '',
    sub: story.author?.display_name || story.author?.username || '',
    seed: story.id || story.slug || story.title || 'story',
  });
  return `/api/og?${params.toString()}`;
}

export default function PublicStoryCard({ story }) {
  const href = publicStoryPath(story);
  if (!href) return null;
  const authorName = story.author?.display_name || story.author?.username || 'LixBlogs author';
  const published = formatDate(story.published_at);

  return (
    <article className="group grid gap-5 border-b border-[var(--divider)] py-7 sm:grid-cols-[minmax(0,1fr)_180px]">
      <div className="min-w-0">
        {story.recommendation_reason?.[0] && (
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-faint)]">
            <ion-icon name="sparkles-outline" /> Suggested · {story.recommendation_reason[0]}
          </p>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
          {story.author?.avatar_url ? (
            <img src={story.author.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--bg-elevated)] font-bold text-[var(--text-secondary)]">
              {authorName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <Link href={`/${encodeURIComponent(story.author?.username || '')}`} className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]">
            {authorName}
          </Link>
          {story.org && (
            <>
              <span aria-hidden="true">in</span>
              <Link href={`/${encodeURIComponent(story.org.slug)}`} className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]">
                {story.org.name}
              </Link>
            </>
          )}
          {published && (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={new Date(story.published_at * 1000).toISOString()}>{published}</time>
            </>
          )}
        </div>

        <Link href={href}>
          <h2 className="font-serif text-[24px] font-extrabold leading-tight tracking-[-0.015em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
            {story.title || 'Untitled'}
          </h2>
          {(story.subtitle || story.excerpt) && (
            <p className="mt-2 line-clamp-2 text-[14px] leading-6 text-[var(--text-muted)]">
              {story.subtitle || story.excerpt}
            </p>
          )}
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-faint)]">
          {(story.tags || []).slice(0, 3).map((tag) => (
            <Link
              key={tag}
              href={`/tag/${encodeURIComponent(tag.toLowerCase())}`}
              rel="tag"
              className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-[var(--text-body)] hover:text-[var(--accent)]"
            >
              #{tag}
            </Link>
          ))}
          {story.read_time_minutes > 0 && <span>{story.read_time_minutes} min read</span>}
        </div>
      </div>

      <Link href={href} className="order-first sm:order-none" aria-label={`Read ${story.title || 'story'}`}>
        <img
          src={story.cover_image_r2_key || fallbackCover(story)}
          alt=""
          className="aspect-[16/10] h-full max-h-[150px] w-full rounded-xl bg-[var(--bg-elevated)] object-cover"
          loading="lazy"
        />
      </Link>
    </article>
  );
}
