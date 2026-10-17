import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';
import QrGenerator from './QrGenerator';

const pageTitle = 'Quick QR Code Generator for Links';
const pageDescription =
  'Turn any URL into a downloadable QR code in seconds. Create free basic QR codes, unlock custom styles and logos, or track scans with a paid Lixrl plan.';

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  keywords: [
    'QR code generator',
    'free QR code generator',
    'URL to QR code',
    'link QR code generator',
    'quick QR code generator',
    'custom QR code',
    'tracked QR code',
    'QR code scan analytics',
  ],
  alternates: { canonical: '/generate' },
  openGraph: {
    type: 'website',
    url: '/generate',
    title: `${pageTitle} | Lixrl`,
    description: pageDescription,
    images: [
      {
        url: '/og-image.png',
        width: 1822,
        height: 825,
        alt: 'Lixrl quick QR code generator for links',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${pageTitle} | Lixrl`,
    description: pageDescription,
    images: ['/og-image.png'],
  },
};

const faqs = [
  {
    question: 'Can I create a QR code for free?',
    answer:
      'Yes. Paste a complete web address, choose one of the three basic styles, and export the QR code as SVG, PNG, or JPEG. Basic generation does not require an account.',
  },
  {
    question: 'What is a tracked QR code?',
    answer:
      'A tracked QR code contains a Lixrl short link. When someone scans it, the redirect records activity that the link owner can review in the dashboard.',
  },
  {
    question: 'Which QR features require a paid plan?',
    answer:
      'Pro and Business unlock the complete style catalog, custom center logos, and the tracked QR workflow. Business keeps scan activity history for longer.',
  },
  {
    question: 'Which download format should I use?',
    answer:
      'SVG is best for print because it stays sharp at any size. PNG preserves crisp detail for digital use. JPEG produces a smaller shareable image and can be copied directly in supported browsers.',
  },
];

export default function QrCodeGeneratorPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'Lixrl Quick QR Code Generator',
        url: 'https://lixrl.com/generate',
        description: pageDescription,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern web browser',
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Basic QR code generation with three styles',
        },
        featureList: [
          'Generate a QR code from a URL',
          'Download QR codes as SVG, PNG, or JPEG',
          'Copy a compressed JPEG QR code to the clipboard',
          'Choose QR code styles',
          'Add a custom logo on paid plans',
          'Track QR code scans on paid plans',
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Lixrl',
            item: 'https://lixrl.com',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'QR Code Generator',
            item: 'https://lixrl.com/generate',
          },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ],
  };

  return (
    <div className="theme-light min-h-screen bg-white text-[#111]">
      <Navbar />

      <main>
        <section
          className="mx-auto flex min-h-[calc(100svh-72px)] w-full max-w-7xl flex-col px-4 pb-10 pt-6 md:px-6 md:pt-8"
          aria-labelledby="qr-generator-heading"
        >
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 id="qr-generator-heading" className="text-3xl font-extrabold tracking-[-0.035em] sm:text-4xl">
                Create a QR code
              </h1>
              <p className="mt-1 text-sm text-[#777]">Paste a link. Pick a style. Download instantly.</p>
            </div>
            <p className="text-xs font-semibold text-[#777]">Free · No account required</p>
          </div>
          <QrGenerator />
        </section>

        <section className="border-t border-[#e8e8e8] mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-[0.8fr_1.2fr]" aria-labelledby="tracked-qr-codes">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c62828]">Optional scan tracking</p>
            <h2 id="tracked-qr-codes" className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
              Make the QR code measurable
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#666]">
              A normal QR code opens the destination directly. A tracked QR code opens a Lixrl short link first, so paid members can review scan activity without changing the printed code.
            </p>
            <Link href="/pricing" className="mt-6 inline-flex rounded-full bg-[#111] px-5 py-2.5 text-sm font-semibold text-white no-underline">
              Compare QR features
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-[#e5e5e5] p-6">
              <h3 className="font-bold">Basic QR code</h3>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[#666]">
                <li>Directly opens the destination URL</li>
                <li>Three included visual styles</li>
                <li>SVG, PNG, and JPEG exports</li>
                <li>Compressed JPEG clipboard copy</li>
                <li>No account required</li>
              </ul>
            </article>
            <article className="rounded-2xl border border-[#efc3c1] bg-[#fff8f7] p-6">
              <h3 className="font-bold">Tracked QR code</h3>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[#666]">
                <li>Uses a persistent Lixrl short link</li>
                <li>Complete visual style catalog</li>
                <li>Custom center logo</li>
                <li>Scan activity in the dashboard</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-4 pb-20 md:px-6 md:pb-28" aria-labelledby="qr-faq">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c62828]">QR code questions</p>
            <h2 id="qr-faq" className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">Everything needed before downloading</h2>
          </div>
          <div className="mt-8 divide-y divide-[#e8e8e8] rounded-2xl border border-[#e5e5e5] px-5 md:px-7">
            {faqs.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                  {item.question}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#ddd] text-lg font-normal text-[#777] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-2xl pr-10 pt-3 text-sm leading-6 text-[#666]">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </main>

      <Footer />
    </div>
  );
}
