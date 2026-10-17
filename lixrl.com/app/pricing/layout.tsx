import type { Metadata } from 'next';

const description =
  'Compare Lixrl Free, Pro, and Business plans for URL shortening, QR code generation, scan tracking, custom styles, analytics, and branded subdomains.';

export const metadata: Metadata = {
  title: 'Pricing',
  description,
  alternates: { canonical: '/pricing' },
  openGraph: {
    type: 'website',
    url: '/pricing',
    title: 'Lixrl pricing — Free, Pro, and Business',
    description,
    images: [{ url: '/og-image.png', width: 1822, height: 825, alt: 'Lixrl pricing' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lixrl pricing — Free, Pro, and Business',
    description,
    images: ['/og-image.png'],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
