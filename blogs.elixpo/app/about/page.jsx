import AboutPage from '../../src/views/AboutPage';
import { safeJsonLd } from '../../src/utils/seoContent';

export const metadata = {
  title: 'About',
  description: 'Learn about LixBlogs, the open-source blogging platform for independent writers, developers and teams publishing through the web, CLI or API.',
  alternates: { canonical: 'https://blogs.elixpo.com/about' },
  openGraph: {
    type: 'website',
    title: 'About LixBlogs',
    description: 'An open-source publishing platform for writers, developers and teams using the web, CLI or API.',
    url: 'https://blogs.elixpo.com/about',
    siteName: 'LixBlogs',
    images: ['/og-image.jpg'],
  },
};

export default function About() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'About LixBlogs',
    url: 'https://blogs.elixpo.com/about',
    description: metadata.description,
    isPartOf: { '@id': 'https://blogs.elixpo.com/#website' },
    about: { '@id': 'https://blogs.elixpo.com/#brand' },
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
    <AboutPage />
  </>;
}
