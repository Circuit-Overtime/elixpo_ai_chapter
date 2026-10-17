import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const siteUrl = 'https://lixrl.com';
const title =
  'Lixrl — URL Shortener & Quick QR Code Generator';
const description =
  'Shorten URLs, generate QR codes instantly, create branded short links, and track link or QR scan activity from one focused dashboard.';

// Google Search Console — "HTML tag" verification method. Set
// NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION (the `content` value Google gives you)
// in .env.local and rebuild. Empty → no tag emitted. The DNS-TXT method is an
// alternative that needs no code change at all.
const googleSiteVerification =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s | Lixrl',
  },
  description,
  applicationName: 'Lixrl',
  manifest: '/manifest.webmanifest',
  keywords: [
    'url shortener',
    'link shortener',
    'short links',
    'custom links',
    'branded links',
    'branded subdomains',
    'url analytics',
    'link analytics',
    'link management',
    'URL shortener CLI',
    'QR code CLI',
    'command line link management',
    'qr codes',
    'QR code generator',
    'free QR code generator',
    'URL to QR code',
    'tracked QR codes',
  ],
  
  authors: [{ name: 'Elixpo', url: 'https://elixpo.com' }],
  creator: 'Elixpo',
  publisher: 'Elixpo',
  category: 'business',
  ...(googleSiteVerification
    ? { verification: { google: googleSiteVerification } }
    : {}),
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
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Lixrl',
    title,
    description,
    images: [
      {
        url: '/og-image.png',
        width: 1822,
        height: 825,
        alt: 'Lixrl short links and analytics',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-image.png'],
    creator: '@elixpo',
    site: '@elixpo',
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    title: 'Lixrl',
    statusBarStyle: 'default',
  },
  // Icons declared explicitly so they're emitted as <link> tags pointing
  // at static files in public/. Putting these files under app/ (the
  // Next.js icon convention) would compile them into route handlers,
  // which Cloudflare Pages can't run because they default to the Node
  // runtime — the same break that hit accounts.elixpo earlier.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon0.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon1.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: 'Lixrl',
        url: siteUrl,
        description,
      },
      {
        '@type': 'WebApplication',
        '@id': `${siteUrl}/#application`,
        name: 'Lixrl',
        url: siteUrl,
        description,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern web browser',
        featureList: [
          'Short links',
          'Click analytics',
          'Custom link names',
          'Quick QR code generator',
          'Tracked QR code scans',
          'Expiring links',
          'Branded lixrl.com subdomains',
          'Developer CLI for short links and QR codes',
        ],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free account plan',
        },
      },
    ],
  };

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} overflow-x-hidden`}
      suppressHydrationWarning
    >
      <body className="antialiased overflow-x-hidden font-sans">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
