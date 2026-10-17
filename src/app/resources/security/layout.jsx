export const metadata = {
  title: 'Security',
  description:
    'Your canvas data belongs to you. Zero-knowledge architecture, E2E encryption with AES-GCM 256-bit, and full open-source transparency.',
  openGraph: {
    title: 'Security at LixSketch',
    description:
      'Zero-knowledge architecture, E2E encryption, and full open-source transparency — your diagrams stay private.',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch Security' }],
  },
  twitter: {
    title: 'Security at LixSketch',
    description: 'E2E encrypted canvas with zero-knowledge architecture.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/resources/security' },
}

export default function SecurityLayout({ children }) {
  return children
}
