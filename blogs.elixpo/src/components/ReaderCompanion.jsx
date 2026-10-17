'use client';

import Link from 'next/link';

function IdentityAvatar({ src, name, square = false }) {
  if (src) {
    return <img src={src} alt="" className={`h-10 w-10 shrink-0 object-cover ${square ? 'rounded-lg' : 'rounded-full'}`} />;
  }
  return (
    <span
      className={`grid h-10 w-10 shrink-0 place-items-center bg-[var(--bg-elevated)] text-[13px] font-bold text-[var(--text-muted)] ${square ? 'rounded-lg' : 'rounded-full'}`}
      aria-hidden="true"
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function ReaderCompanion({ author, org, primaryTag }) {
  if (!author?.username) return null;

  const authorName = author.displayName || author.username;
  const topicHref = primaryTag ? `/search?q=${encodeURIComponent(`tag:${primaryTag}`)}` : '/explore';

  return (
    <aside className="reader-companion" aria-label="Story author and related navigation">
      <p className="reader-companion-label">Story by</p>
      <Link href={`/${encodeURIComponent(author.username)}`} className="reader-companion-identity">
        <IdentityAvatar src={author.avatarUrl} name={authorName} />
        <span className="min-w-0">
          <strong className="reader-companion-name">{authorName}</strong>
          <span className="reader-companion-detail">
            {author.designation || `@${author.username}`}
          </span>
        </span>
      </Link>

      {org?.slug && (
        <>
          <div className="reader-companion-divider" />
          <p className="reader-companion-label">Published in</p>
          <Link href={`/${encodeURIComponent(org.slug)}`} className="reader-companion-identity">
            <IdentityAvatar src={org.logoUrl} name={org.name} square />
            <span className="min-w-0">
              <strong className="reader-companion-name">{org.name}</strong>
              <span className="reader-companion-detail">{org.tagline || `@${org.slug}`}</span>
            </span>
          </Link>
        </>
      )}

      <nav className="reader-companion-links" aria-label="Continue exploring">
        <Link href={`/${encodeURIComponent(author.username)}`}>
          <ion-icon name="person-outline" aria-hidden="true" />
          More from this author
        </Link>
        <Link href={topicHref}>
          <ion-icon name={primaryTag ? 'pricetag-outline' : 'compass-outline'} aria-hidden="true" />
          {primaryTag ? `Explore #${primaryTag}` : 'Explore more stories'}
        </Link>
      </nav>
    </aside>
  );
}
