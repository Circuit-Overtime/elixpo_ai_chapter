export const runtime = 'edge';

import { headers } from 'next/headers';
import JoinOrgClient from './client';

// Invite link SEO — org avatar + org name + owner name (GitHub-style white card).
export async function generateMetadata({ params }) {
  const { id } = await params;
  const fallback = { title: 'Join organization · LixBlogs' };
  try {
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`;
    const res = await fetch(`${origin}/api/orgs/invite?inviteId=${encodeURIComponent(id)}`, { headers: { 'user-agent': 'lixblogs-ssr' } });
    if (!res.ok) return fallback;
    const d = await res.json();
    if (!d.org) return fallback;

    const httpImg = (u) => (typeof u === 'string' && /^https?:\/\//.test(u) ? u : '');
    const ownerName = d.owner?.display_name || d.owner?.username || '';
    const title = d.org.name || 'an organization';
    const url = `${origin}/org/join/${id}`;
    const description = [
      d.org.tagline,
      `You're invited to join ${title}${ownerName ? ` (by ${ownerName})` : ''} on LixBlogs.`,
    ].filter(Boolean).join(' ');
    const og = `${origin}/api/og?${new URLSearchParams({
      v: d.org.updated_at || '1',
      type: 'profile',
      kind: 'Invitation to join',
      title,
      sub: ownerName ? `by ${ownerName}` : `@${d.org.slug || ''}`,
      avatar: httpImg(d.org.logo_url),
    })}`;
    return {
      title: `Join ${title} · LixBlogs`,
      description,
      alternates: { canonical: url },
      openGraph: { type: 'website', title: `Join ${title}`, description, url, siteName: 'LixBlogs', images: [{ url: og, secureUrl: og, type: 'image/png', width: 1200, height: 630, alt: title }] },
      twitter: { card: 'summary_large_image', title: `Join ${title}`, description, images: [og] },
    };
  } catch {
    return fallback;
  }
}

export default function JoinOrgPage({ params }) {
  return <JoinOrgClient params={params} />;
}
