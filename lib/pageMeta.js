const SITE_URL = 'https://blogs.elixpo.com';
const SITE_NAME = 'LixBlogs';

// Metadata for a static, indexable page. Next.js does not deep-merge openGraph or
// twitter: a page that sets only title/description inherits the root layout's
// cards wholesale, so every shared link previewed as the homepage (og:url = /).
export function staticPageMeta({ title, description, path, ...rest }) {
  const url = `${SITE_URL}${path}`;
  const cardTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: cardTitle,
      description,
      url,
      images: ['/og-image.jpg'],
    },
    twitter: {
      card: 'summary_large_image',
      title: cardTitle,
      description,
      images: ['/og-image.jpg'],
    },
    ...rest,
  };
}
