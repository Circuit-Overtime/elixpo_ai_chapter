export const metadata = {
  title: 'How to Start',
  description:
    'Everything you need to go from zero to diagram — tools, shapes, arrows, shortcuts, LixScript, and sharing. No account required.',
  openGraph: {
    title: 'How to Start with LixSketch',
    description:
      'Complete getting-started guide — drawing tools, keyboard shortcuts, LixScript diagrams, and sharing.',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch Getting Started' }],
  },
  twitter: {
    title: 'How to Start with LixSketch',
    description: 'From zero to diagram in minutes. No account, no install.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/resources/how-to-start' },
}

export default function HowToStartLayout({ children }) {
  return children
}
