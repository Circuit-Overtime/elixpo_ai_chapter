export const metadata = {
  title: 'Teams & Collaboration',
  description:
    'Encrypted real-time collaboration on LixSketch with live cursors, synchronized canvas updates, and plan-based room capacity.',
  openGraph: {
    title: 'LixSketch Teams & Collaboration',
    description:
      'Start an encrypted room, share its link, and draw together with live cursors and synchronized updates.',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch Collaboration' }],
  },
  twitter: {
    title: 'LixSketch Teams & Collaboration',
    description: 'Encrypted real-time collaboration with live cursors and synchronized canvas updates.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/teams' },
}

export default function TeamsLayout({ children }) {
  return children
}
