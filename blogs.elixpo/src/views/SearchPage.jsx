'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '../components/AppShell';
import SearchBar from '../components/SearchBar';
import { generateBlogBanner, generatePixelAvatar } from '../utils/pixelAvatar';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Avatar({ src, name, size = 40, rounded = 'rounded-full' }) {
  return <img src={src || generatePixelAvatar(name || 'lixblogs-user')} alt="" className={`${rounded} object-cover flex-shrink-0`} style={{ width: size, height: size }} />;
}

function SectionHeading({ children, count }) {
  return (
    <h2 className="text-[12px] font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: 'var(--text-faint)' }}>
      {children}
      {count > 0 && <span className="font-normal normal-case tracking-normal px-2 py-0.5 rounded-full text-[10px]" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{count}</span>}
    </h2>
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = (searchParams.get('q') || '').trim();
  const tab = searchParams.get('tab') || 'all';

  const [results, setResults] = useState({ blogs: [], users: [], orgs: [] });
  const [unknown, setUnknown] = useState([]); // qualifiers the parser didn't recognise
  const [loading, setLoading] = useState(!!q);

  const runSearch = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setResults({ blogs: [], users: [], orgs: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const enc = encodeURIComponent(query);
    try {
      const [blogs, users, orgs] = await Promise.all([
        fetch(`/api/search/blogs?q=${enc}&limit=20&fields=slugid,slug,title,author,tags,likes,comments`).then(r => r.json()).catch(() => ({ blogs: [] })),
        fetch(`/api/search/users?q=${enc}&limit=20&fields=id,username,display_name,avatar_url,bio,followers,blogs`).then(r => r.json()).catch(() => ({ users: [] })),
        fetch(`/api/search/orgs?q=${enc}&limit=20&fields=id,slug,name,tagline,logo_url,description,members,blogs`).then(r => r.json()).catch(() => ({ orgs: [] })),
      ]);
      setResults({ blogs: blogs.blogs || [], users: users.users || [], orgs: orgs.orgs || [] });
      setUnknown(blogs.unknown || []);
    } catch {
      setResults({ blogs: [], users: [], orgs: [] });
      setUnknown([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { runSearch(q); }, [q, runSearch]);

  // SearchBar owns submission: it pushes /search?q=…, and this page re-reads the URL.
  const setTab = (id) => {
    router.push(`/search?q=${encodeURIComponent(q)}${id !== 'all' ? `&tab=${id}` : ''}`);
  };

  const showBlogs = tab === 'all' || tab === 'blogs';
  const showPeople = tab === 'all' || tab === 'people';
  const showOrgs = tab === 'all' || tab === 'orgs';
  const totalCount = results.blogs.length + results.users.length + results.orgs.length;
  const visibleCount = tab === 'blogs'
    ? results.blogs.length
    : tab === 'people'
      ? results.users.length
      : tab === 'orgs'
        ? results.orgs.length
        : totalCount;
  const nothing = !loading && q.length >= 2 && visibleCount === 0;

  return (
    <AppShell>
      <div className="search-page-container">
        <style dangerouslySetInnerHTML={{ __html: `
          .search-page-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 24px;
          }

          .search-qualifiers-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px;
            margin-top: 24px;
          }

          .search-qualifier-card {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            padding: 16px;
            border-radius: 12px;
            border: 1px solid var(--border-default);
            background: var(--bg-surface);
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            text-align: left;
            width: 100%;
          }

          .search-qualifier-card:hover {
            transform: translateY(-2px);
            border-color: rgba(155, 123, 247, 0.4);
            background: var(--bg-hover);
            box-shadow: 0 8px 30px rgba(155, 123, 247, 0.04);
          }

          .search-qualifier-card code {
            font-family: monospace;
            font-size: 13px;
            color: #9b7bf7;
            font-weight: 600;
          }

          .search-qualifier-card span {
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.4;
          }

          /* Tabs */
          .search-tabs-container {
            display: flex;
            gap: 4px;
            margin-bottom: 28px;
            border-bottom: 1px solid var(--border-default);
            padding-bottom: 4px;
            overflow-x: auto;
          }

          .search-tab-button {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            font-size: 13px;
            font-weight: 500;
            border-radius: 20px;
            border: 1px solid transparent;
            background: transparent;
            color: var(--text-faint);
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
          }

          .search-tab-button:hover {
            color: var(--text-primary);
            background: var(--bg-hover);
          }

          .search-tab-button.active {
            color: #9b7bf7;
            background: rgba(155, 123, 247, 0.08);
            border-color: rgba(155, 123, 247, 0.15);
            font-weight: 600;
          }

          .search-tab-badge {
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 10px;
            background: var(--bg-elevated);
            color: var(--text-muted);
            font-weight: 500;
            transition: all 0.2s ease;
          }

          .search-tab-button.active .search-tab-badge {
            background: #9b7bf7;
            color: #ffffff;
          }

          /* Blog Cards */
          .search-blog-card {
            display: flex;
            gap: 20px;
            padding: 16px;
            border-radius: 16px;
            border: 1px solid var(--border-default);
            background: var(--bg-surface);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            text-decoration: none !important;
          }

          .search-blog-card:hover {
            transform: translateY(-2px);
            border-color: rgba(155, 123, 247, 0.3);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.03);
            background: var(--bg-hover);
          }

          [data-theme="dark"] .search-blog-card:hover {
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
          }

          .search-blog-image-wrap {
            width: 130px;
            height: 86px;
            border-radius: 10px;
            overflow: hidden;
            flex-shrink: 0;
            background: var(--bg-elevated);
            position: relative;
          }

          .search-blog-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.5s ease;
          }

          .search-blog-card:hover .search-blog-image {
            transform: scale(1.05);
          }

          .search-blog-content {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            flex: 1;
            min-width: 0;
          }

          .search-blog-title {
            font-size: 16px;
            font-weight: 700;
            line-height: 1.35;
            color: var(--text-primary);
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            margin-bottom: 4px;
          }

          .search-blog-subtitle {
            font-size: 13px;
            color: var(--text-muted);
            line-height: 1.45;
            display: -webkit-box;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
            margin-bottom: 8px;
          }

          .search-blog-meta {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 11px;
            color: var(--text-faint);
            flex-wrap: wrap;
          }

          .search-author-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: var(--bg-elevated);
            padding: 2px 8px 2px 4px;
            border-radius: 12px;
            color: var(--text-secondary);
            font-weight: 500;
          }

          /* User/Org Cards */
          .search-entity-card {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            border-radius: 16px;
            border: 1px solid var(--border-default);
            background: var(--bg-surface);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            text-decoration: none !important;
          }

          .search-entity-card:hover {
            transform: translateY(-2px);
            border-color: rgba(155, 123, 247, 0.3);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.03);
            background: var(--bg-hover);
          }

          .search-entity-avatar {
            transition: transform 0.3s ease;
          }

          .search-entity-card:hover .search-entity-avatar {
            transform: scale(1.05);
          }

          /* Loading skeleton animation */
          .search-skeleton-card {
            display: flex;
            gap: 20px;
            padding: 16px;
            border-radius: 16px;
            border: 1px solid var(--border-default);
            background: var(--bg-surface);
          }

          .search-skeleton-shimmer {
            background: linear-gradient(
              90deg,
              var(--bg-elevated) 25%,
              var(--bg-hover) 50%,
              var(--bg-elevated) 75%
            );
            background-size: 200% 100%;
            animation: searchShimmer 1.5s infinite linear;
          }

          @keyframes searchShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        ` }} />

        {/* Search Input bar */}
        <div className="mb-8">
          <SearchBar defaultQuery={q} autoFocus={!q} />
        </div>

        {!q ? (
          <div className="py-10 text-center">
            <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ background: 'linear-gradient(135deg, #9b7bf7, #c573f0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Discover LixBlogs
            </h1>
            <p className="text-[14px] mb-8 max-w-md mx-auto" style={{ color: 'var(--text-faint)' }}>
              Search for blogs, authors, topics, and organizations across the platform.
            </p>
            <p className="text-[12px] font-semibold tracking-wide uppercase mb-4" style={{ color: 'var(--text-muted)' }}>Filter by qualifier:</p>
            <div className="search-qualifiers-grid max-w-2xl mx-auto">
              {[
                { code: 'tag:hacktoberfest', desc: 'Find blogs with a specific tag', icon: 'tag-outline' },
                { code: 'author:nonsense3', desc: 'Find posts by a specific user', icon: 'person-outline' },
                { code: 'org:gdgoc', desc: 'Find posts under an organization', icon: 'business-outline' },
                { code: 'sort:likes', desc: 'Sort results by likes or date', icon: 'trending-up-outline' },
                { code: '"exact phrase"', desc: 'Search for literal matching phrases', icon: 'quote-outline' },
                { code: '-tag:meetup', desc: 'Exclude tags or search terms', icon: 'close-circle-outline' },
              ].map(ex => (
                <button
                  key={ex.code}
                  onClick={() => router.push(`/search?q=${encodeURIComponent(ex.code)}`)}
                  className="search-qualifier-card"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <ion-icon name={ex.icon} style={{ fontSize: '15px', color: '#9b7bf7' }} />
                    <code>{ex.code}</code>
                  </div>
                  <span>{ex.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                {loading ? 'Searching' : `${totalCount} result${totalCount === 1 ? '' : 's'}`} for{' '}
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>“{q}”</span>
              </p>
              <Link href="/docs/search" className="text-[12px] flex items-center gap-1 flex-shrink-0 hover:underline" style={{ color: 'var(--text-faint)' }}>
                <ion-icon name="help-circle-outline" style={{ fontSize: '13px' }} />
                Search syntax
              </Link>
            </div>

            {/* A typo like `athor:bob` silently searching for literal text is
                confusing — say so instead of letting the user wonder. */}
            {!loading && unknown.length > 0 && (
              <div
                className="mb-5 rounded-lg px-3 py-2 text-[12px]"
                style={{ backgroundColor: 'rgba(232,168,64,0.08)', border: '1px solid rgba(232,168,64,0.3)', color: 'var(--text-muted)' }}
              >
                Not a known qualifier:{' '}
                {unknown.map(u => <code key={u} className="font-mono" style={{ color: '#e8a840' }}>{u}</code>).reduce((a, b) => [a, ', ', b])}
                {' '}— searched as plain text instead.
              </div>
            )}

            {/* Tabs */}
            <div className="search-tabs-container">
              {[
                { id: 'all', label: 'All', count: totalCount },
                { id: 'blogs', label: 'Blogs', count: results.blogs.length },
                { id: 'people', label: 'People', count: results.users.length },
                { id: 'orgs', label: 'Organizations', count: results.orgs.length },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`search-tab-button ${tab === t.id ? 'active' : ''}`}
                >
                  <span>{t.label}</span>
                  <span className="search-tab-badge">{t.count}</span>
                </button>
              ))}
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="search-skeleton-card">
                    <div className="search-blog-image-wrap search-skeleton-shimmer" style={{ width: 130, height: 86 }} />
                    <div className="flex-1 space-y-3 py-1">
                      <div className="h-4 rounded search-skeleton-shimmer" style={{ width: '70%' }} />
                      <div className="h-3 rounded search-skeleton-shimmer" style={{ width: '40%' }} />
                      <div className="flex gap-2 pt-2">
                        <div className="h-5 rounded-full search-skeleton-shimmer" style={{ width: 60 }} />
                        <div className="h-5 rounded-full search-skeleton-shimmer" style={{ width: 80 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : nothing ? (
              <div className="text-center py-16 px-4 rounded-2xl border" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>
                  </svg>
                </div>
                <p className="text-[15px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>No results found for “{q}”</p>
                <p className="text-[13px] max-w-xs mx-auto" style={{ color: 'var(--text-faint)' }}>Try checking your spelling, using different keywords, or broadening your search terms.</p>
              </div>
            ) : (
              <div className="space-y-10">
                {/* Blogs */}
                {showBlogs && results.blogs.length > 0 && (
                  <section>
                    <SectionHeading count={results.blogs.length}>Blogs</SectionHeading>
                    <div className="space-y-4">
                      {results.blogs.map(b => (
                        <Link
                          key={b.slugid}
                          href={`/${b.author_username || 'blog'}/${b.slug}`}
                          className="search-blog-card group"
                        >
                          <div className="search-blog-image-wrap">
                            <img
                              src={b.cover_image_r2_key || generateBlogBanner(b.slugid || b.slug)}
                              alt=""
                              className="search-blog-image"
                            />
                          </div>
                          <div className="search-blog-content">
                            <div>
                              <p className="search-blog-title">
                                {b.page_emoji ? `${b.page_emoji} ` : ''}{b.title}
                              </p>
                              {b.subtitle && (
                                <p className="search-blog-subtitle">{b.subtitle}</p>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-4 flex-wrap mt-2">
                              <div className="search-blog-meta">
                                {b.author_username ? (
                                  <span className="search-author-badge">
                                    <Avatar src={b.author_avatar} name={b.author_name || b.author_username} size={16} />
                                    <span>{b.author_name || b.author_username}</span>
                                  </span>
                                ) : null}
                                {b.published_at ? (
                                  <>
                                    <span>·</span>
                                    <span>{timeAgo(b.published_at)}</span>
                                  </>
                                ) : null}
                                {b.read_time_minutes ? (
                                  <>
                                    <span>·</span>
                                    <span>{b.read_time_minutes} min read</span>
                                  </>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-3 flex-shrink-0">
                                {b.likes > 0 && (
                                  <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-red-500"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                    {b.likes}
                                  </span>
                                )}
                                {b.comments > 0 && (
                                  <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                    {b.comments}
                                  </span>
                                )}
                              </div>
                            </div>

                            {b.tags && b.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {b.tags.slice(0, 3).map(t => (
                                  <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: 'rgba(155,123,247,0.08)', color: '#9b7bf7', border: '1px solid rgba(155,123,247,0.15)' }}>
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {/* People */}
                {showPeople && results.users.length > 0 && (
                  <section>
                    <SectionHeading count={results.users.length}>People</SectionHeading>
                    <div className="space-y-3">
                      {results.users.map(u => (
                        <Link
                          key={u.id}
                          href={`/${u.username}`}
                          className="search-entity-card"
                        >
                          <div className="search-entity-avatar">
                            <Avatar src={u.avatar_url} name={u.display_name || u.username} size={44} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{u.display_name || u.username}</p>
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>User</span>
                            </div>
                            <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                              @{u.username}
                              {typeof u.followers === 'number' ? ` · ${u.followers} follower${u.followers === 1 ? '' : 's'}` : ''}
                            </p>
                            {u.bio && <p className="text-[12px] mt-1 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{u.bio}</p>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {/* Organizations */}
                {showOrgs && results.orgs.length > 0 && (
                  <section>
                    <SectionHeading count={results.orgs.length}>Organizations</SectionHeading>
                    <div className="space-y-3">
                      {results.orgs.map(o => (
                        <Link
                          key={o.id}
                          href={`/${o.slug}`}
                          className="search-entity-card"
                        >
                          <div className="search-entity-avatar">
                            <Avatar src={o.logo_url} name={o.name || o.slug} size={44} rounded="rounded-lg" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{o.name || o.slug}</p>
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(155,123,247,0.1)', color: '#9b7bf7' }}>Organization</span>
                            </div>
                            <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                              @{o.slug}
                              {typeof o.member_count === 'number' ? ` · ${o.member_count} member${o.member_count === 1 ? '' : 's'}` : ''}
                            </p>
                            {(o.tagline || o.description || o.bio) && (
                              <p className="text-[12px] mt-1 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{o.tagline || o.description || o.bio}</p>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

                {/* Tab-scoped empty states */}
                {showBlogs && tab === 'blogs' && results.blogs.length === 0 && (
                  <p className="text-center py-12 text-[13px]" style={{ color: 'var(--text-faint)' }}>No blogs match “{q}”.</p>
                )}
                {showPeople && tab === 'people' && results.users.length === 0 && (
                  <p className="text-center py-12 text-[13px]" style={{ color: 'var(--text-faint)' }}>No people match “{q}”.</p>
                )}
                {showOrgs && tab === 'orgs' && results.orgs.length === 0 && (
                  <p className="text-center py-12 text-[13px]" style={{ color: 'var(--text-faint)' }}>No organizations match “{q}”.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
