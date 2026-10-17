export const metadata = {
  title: 'Use Cases',
  description:
    'Architecture diagrams, wireframes, brainstorming, documentation, flowcharts — see how teams use LixSketch.',
  openGraph: {
    title: 'LixSketch Use Cases',
    description:
      'Architecture diagrams, wireframes, brainstorming, documentation — discover what you can build.',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch Use Cases' }],
  },
  twitter: {
    title: 'LixSketch Use Cases',
    description: 'Architecture diagrams, wireframes, brainstorming, and more.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/resources/use-cases' },
}

export default function UseCasesLayout({ children }) {
  return children
}
