import './globals.css'
import 'highlight.js/styles/github-dark-dimmed.css'
import InitHljs from '@/components/InitHljs'
const SITE_URL = 'https://sketch.elixpo.com'
const SITE_NAME = 'Elixpo Sketch'
const SITE_TAGLINE = 'Open Source Infinite Canvas, Hand Drawn Aesthetics, Built In Docs Editor'
const SITE_DESCRIPTION =
  'LixSketch is a free, open-source collaborative whiteboard for technical diagrams, wireframes, flowcharts, architecture drawings, and presentations. No login required — start drawing instantly as a guest. Features AI-powered smart editing (Beta), end-to-end encrypted sharing, real-time collaboration with live cursors, a Notion-style docs editor, LixScript DSL for scripted diagrams, 250K+ icons, and a VS Code extension. Runs entirely in the browser. Forever free.'

// Canvas routes need their persisted theme before React hydrates. Keeping this
// tiny bootstrap before the application markup prevents a dark-to-light (or
// light-to-dark) frame while the client stores restore local preferences.
const canvasThemeBootstrap = `
  (() => {
    try {
      if (!/^\\/(c|room)\\//.test(location.pathname)) return;
      const allowedThemes = new Set(['dark', 'light', 'system']);
      let theme = localStorage.getItem('theme');
      if (!allowedThemes.has(theme)) {
        const prefs = JSON.parse(localStorage.getItem('lix_ui_prefs') || '{}');
        theme = allowedThemes.has(prefs.theme) ? prefs.theme : 'dark';
      }
      const resolved = theme === 'system'
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
      const defaults = { dark: '#15111f', light: '#FFFFFF' };
      const palettes = {
        dark: ['#000000', '#161718', '#15111f', '#181605', '#1b1615'],
        light: ['#ffffff', '#f6dbc0', '#f5eed2', '#f5f2ed', '#f5dabf'],
      };
      const stored = localStorage.getItem('lixsketch-canvas-background-' + resolved);
      const background = stored && palettes[resolved].includes(stored.toLowerCase())
        ? stored
        : defaults[resolved];
      document.documentElement.dataset.canvasTheme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.documentElement.style.setProperty('--lixsketch-canvas-background', background);
      document.body.classList.add('canvas-mode', 'theme-' + resolved);
    } catch (_) {}
  })();
`
export const metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: `${SITE_NAME} | ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,

  applicationName: SITE_NAME,
  authors: [{ name: 'Elixpo', url: 'https://elixpo.com' }],
  creator: 'Elixpo',
  publisher: 'Elixpo',
  generator: 'Next.js',

  keywords: [
    'Elixpo Sketch',
    'Elixpo',
    'open source whiteboard',
    'infinite canvas',
    'sketching tool',
    'wireframing tool',
    'diagram tool',
    'eraser.io alternative',
    'excalidraw alternative',
    'tldraw alternative',
    'hand drawn diagrams',
    'roughjs',
    'perfect freehand',
    'real time collaboration',
    'end to end encrypted whiteboard',
    'block editor',
    'WYSIWYG docs editor',
    'LixScript',
    'mermaid diagrams',
    'graph plotting',
    'SVG canvas',
    'architecture diagrams',
    'flowcharts',
    'sequence diagrams',
    'developer tools',
    'product design',
    'system design',
    'free whiteboard',
    'no login whiteboard',
    'collaborative canvas',
    'AI diagram tool',
    'VS Code whiteboard extension',
    'LixSketch',
    'technical presentation tool',
    'online diagramming',
  ],

  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '1024x1024' },
    ],
    apple: [
      { url: '/icon.png', sizes: '1024x1024', type: 'image/png' },
    ],
    shortcut: '/icon.png',
  },
  manifest: '/site.webmanifest',

  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1280,
        height: 720,
        alt: 'Elixpo Sketch, hand drawn infinite canvas with real time collaboration and built in docs editor',
        type: 'image/png',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
    creator: '@elixpo',
    site: '@elixpo',
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
    canonical: SITE_URL,
  },

  category: 'technology',
}

export const viewport = {
  themeColor: '#120e1a',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Web',
  logo: `${SITE_URL}/icon.png`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  author: {
    '@type': 'Organization',
    name: 'Elixpo',
    url: 'https://elixpo.com',
  },
  image: `${SITE_URL}/og-image.png`,
  screenshot: `${SITE_URL}/og-image.png`,
  featureList: [
    'Infinite canvas with hand-drawn aesthetics',
    'Real-time collaboration with live cursors',
    'E2E encryption for shared canvases',
    'LixScript diagram DSL',
    'Notion-like docs editor',
    'Icon library with 250K+ icons',
    'PNG and SVG export',
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="stylesheet" href="/boxicons/css/boxicons.min.css" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: canvasThemeBootstrap }} />
        <InitHljs />
        {children}
      </body>
    </html>
  )
}
