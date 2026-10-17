export const metadata = {
  title: 'Pricing in India | LixSketch',
  description:
    'Compare LixSketch Guest, Free, and Pro plans in Indian rupees, including workspace, image, collaboration, and export limits.',
  keywords: [
    'LixSketch pricing',
    'online whiteboard pricing India',
    'diagram tool pricing',
    'collaborative canvas India',
  ],
  openGraph: {
    title: 'LixSketch Pricing — Guest, Free, and Pro',
    description: 'Simple India-first pricing for visual thinking, from ₹0.',
    type: 'website',
    url: '/pricing',
    images: [{ url: '/og-image.png', width: 1280, height: 720, alt: 'LixSketch pricing plans' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LixSketch Pricing — Guest, Free, and Pro',
    description: 'Simple India-first pricing for visual thinking, from ₹0.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/pricing' },
}

export default function PricingLayout({ children }) {
  return children
}
