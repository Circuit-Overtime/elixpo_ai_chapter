'use client';

/**
 * Displays blog attribution: org logo + org name + "by" + author(s).
 * For multiple authors: "First Author + N others"
 *
 * Props:
 *   org         - { name, slug, logo_url } (optional — omitted for personal blogs)
 *   authors     - [{ name, username, avatar_url }] (at least one)
 *   size        - "sm" | "md" (default "md")
 */
export default function AuthorAttribution({ org, authors = [], size = 'md' }) {
  const isSmall = size === 'sm';
  const logoSize = isSmall ? 'h-5 w-5' : 'h-[25px] w-[25px]';
  const textSize = isSmall ? 'text-[12px]' : 'text-[14px]';

  const primaryAuthor = authors[0];
  const othersCount = authors.length - 1;

  const authorLabel = primaryAuthor
    ? primaryAuthor.name || primaryAuthor.username || 'Unknown'
    : 'Unknown';

  return (
    <div className={`flex flex-row items-center gap-2 flex-wrap ${textSize}`}>
      {org && (
        <>
          {org.logo_url ? (
            <img
              src={org.logo_url}
              alt=""
              className={`${logoSize} rounded-[6px] object-cover`}
            />
          ) : (
            <div
              className={`${logoSize} rounded-[6px] flex items-center justify-center text-[10px] font-bold`}
              style={{ backgroundColor: 'var(--bg-elevated, #1D202A)', color: 'var(--text-faint, #888)' }}
            >
              {(org.name || '?')[0].toUpperCase()}
            </div>
          )}
          <span
            className="underline cursor-pointer font-medium"
            style={{ color: 'var(--text-primary, #fff)' }}
          >
            {org.name}
          </span>
          <span style={{ color: 'var(--text-faint, #888)' }}>by</span>
        </>
      )}

      {primaryAuthor?.avatar_url && !org && (
        <img
          src={primaryAuthor.avatar_url}
          alt=""
          className={`${isSmall ? 'h-5 w-5' : 'h-6 w-6'} rounded-full object-cover`}
        />
      )}

      <span
        className="cursor-pointer font-medium"
        style={{ color: 'var(--text-primary, #fff)' }}
      >
        {authorLabel}
      </span>

      {othersCount > 0 && (
        <span style={{ color: 'var(--text-faint, #888)' }}>
          + {othersCount} {othersCount === 1 ? 'other' : 'others'}
        </span>
      )}
    </div>
  );
}
