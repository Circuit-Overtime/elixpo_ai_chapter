import './globals.css';
import '../src/themes/seasonal/seasonal.css';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { SeasonalThemeProvider } from '../src/themes/seasonal/SeasonalThemeProvider';
import { seasonalThemeBootstrapScript } from '../src/themes/seasonal/index';
import ScrollToTopButton from '../src/components/ScrollToTopButton';

const SITE_URL = 'https://blogs.elixpo.com';
const SITE_NAME = 'LixBlogs';

// Search snippets are cut around 155-160 characters, so the first sentence has to
// carry the pitch on its own and the rest is bonus. Every claim here has to be true:
// the old copy advertised "AI writing tools", which are not currently enabled.
const SITE_DESC =
  'LixBlogs is an open-source blogging platform for writers, developers and teams to create stories, collaborate live, and publish from the web, CLI or API.';
const SITE_TAGLINE = 'Open-source blogging and publishing platform';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
    // Pipe reads better than a hyphen and survives truncation in search results.
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  category: 'technology',
  keywords: [
    'blogging platform', 'publishing platform', 'block editor', 'technical blog',
    'developer blog', 'team blog', 'real-time collaboration', 'organizations',
    'write online', 'LixBlogs',
  ],
  authors: [{ name: 'Elixpo', url: 'https://github.com/elixpo' }],
  creator: 'Elixpo',
  publisher: 'Elixpo',
  referrer: 'origin-when-cross-origin',
  formatDetection: { telephone: false, address: false, email: false },
  icons: {
    icon: [
      // SVG favicon embedding the LixBlogs logo (logo.png).
      { url: '/favicon.svg', type: 'image/svg+xml' },
      // Fallback for browsers without SVG-favicon support, and the path crawlers request first.
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESC,
    url: SITE_URL,
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: `${SITE_NAME}: ${SITE_TAGLINE}`,
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESC,
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    types: { 'application/rss+xml': `${SITE_URL}/feed.xml` },
  },
};

export const viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
};

// Site-wide structured data. `WebSite` + `SearchAction` is what makes Google offer a
// sitelinks search box for the domain, and it points at the real /search?q= route.
// `Organization` gives the brand panel something to attach a logo and profiles to.
const SITE_JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: ['LixBlogs by Elixpo', 'Elixpo Blogs', 'Lix Blogs', 'blogs.elixpo.com'],
      description: SITE_DESC,
      publisher: { '@id': `${SITE_URL}/#organization` },
      brand: { '@id': `${SITE_URL}/#brand` },
      inLanguage: 'en',
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Blog',
      '@id': `${SITE_URL}/#blog`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: 'LixBlogs by Elixpo',
      description: SITE_DESC,
      publisher: { '@id': `${SITE_URL}/#organization` },
      brand: { '@id': `${SITE_URL}/#brand` },
      isPartOf: { '@id': `${SITE_URL}/#website` },
      inLanguage: 'en',
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Elixpo',
      alternateName: 'Elixpo Chapter',
      url: 'https://elixpo.com',
      email: 'hello@elixpo.com',
      sameAs: [
        'https://github.com/elixpo',
        'https://www.linkedin.com/in/elixpo',
        'https://www.youtube.com/@elixpo',
        'https://www.instagram.com/elixpo_',
      ],
    },
    {
      '@type': 'Brand',
      '@id': `${SITE_URL}/#brand`,
      name: SITE_NAME,
      alternateName: ['LixBlogs by Elixpo', 'Elixpo Blogs'],
      url: SITE_URL,
      slogan: SITE_TAGLINE,
      description: SITE_DESC,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
      sameAs: ['https://github.com/elixpo/blogs.elixpo'],
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply date-based themes before first paint; the provider keeps it current. */}
        <script dangerouslySetInnerHTML={{ __html: seasonalThemeBootstrapScript() }} />
        <link rel="alternate" type="application/rss+xml" title="LixBlogs recent stories" href="/feed.xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Kanit:wght@500;600;700&family=Source+Serif+4:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSONLD) }}
        />
        {/* Prevent a flash of the wrong theme before React mounts. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var t = localStorage.getItem('lixblogs_theme');
              var isDark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
              var color = isDark ? '#131922' : '#ffffff';
              if (isDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
              }
              document.documentElement.style.backgroundColor = color;
              var meta = document.querySelector('meta[name="theme-color"]');
              if (meta) meta.setAttribute('content', color);
            } catch(e) {}
          })();
        `}} />
        {/* Recover once when cached HTML references a chunk from an older deploy. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var key = 'lixblogs_chunk_recovery:' + location.pathname;
            function recover(value) {
              var text = String(value || '');
              if (!/ChunkLoadError|Loading chunk|_next\\/static\\/chunks/i.test(text)) return;
              try {
                var last = Number(sessionStorage.getItem(key) || 0);
                if (Date.now() - last < 60000) return;
                sessionStorage.setItem(key, String(Date.now()));
              } catch (_) {}
              var url = new URL(location.href);
              url.searchParams.set('__chunk_retry', String(Date.now()));
              location.replace(url.toString());
            }
            addEventListener('error', function (event) {
              recover((event.message || '') + ' ' + (event.filename || '') + ' ' + (event.target && event.target.src || ''));
            }, true);
            addEventListener('unhandledrejection', function (event) {
              recover(event.reason && (event.reason.stack || event.reason.message) || event.reason);
            });
            addEventListener('load', function () {
              setTimeout(function () {
                try { sessionStorage.removeItem(key); } catch (_) {}
                var url = new URL(location.href);
                if (url.searchParams.has('__chunk_retry')) {
                  url.searchParams.delete('__chunk_retry');
                  history.replaceState(history.state, '', url.toString());
                }
              }, 10000);
            });
          })();
        `}} />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Source Serif 4', 'Georgia', serif" }}>
        <SeasonalThemeProvider>
          <ThemeProvider>
            <AuthProvider>
              {children}
              <ScrollToTopButton />
            </AuthProvider>
          </ThemeProvider>
        </SeasonalThemeProvider>
        <script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js" defer />
        <script noModule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js" defer />
      </body>
    </html>
  );
}
