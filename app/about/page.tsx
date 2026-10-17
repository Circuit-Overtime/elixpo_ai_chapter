import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';

const title = 'About Lixrl';
const description =
  'Learn how Lixrl turns long addresses into fast, recognizable links with clear analytics, flexible controls, and branded subdomains.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'website',
    url: '/about',
    title: 'About Lixrl — A clearer way to share links',
    description,
    images: [{ url: '/og-image.png', width: 1822, height: 825, alt: 'Lixrl link shortener' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Lixrl — A clearer way to share links',
    description,
    images: ['/og-image.png'],
  },
};

const outcomes = [
  {
    number: '01',
    title: 'Make links easier to share',
    body: 'Turn a long address into a short link that fits naturally in a post, message, profile, presentation, or QR code.',
  },
  {
    number: '02',
    title: 'Understand what happens next',
    body: 'See when people open a link and learn which locations, devices, and sources are bringing attention to it.',
  },
  {
    number: '03',
    title: 'Keep every link under control',
    body: 'Choose memorable names, set expiry dates, organize campaigns, and manage links from one focused dashboard.',
  },
  {
    number: '04',
    title: 'Give links a recognizable home',
    body: 'Paid plans can use a single-level branded address such as yourbrand.lixrl.com, while Lixrl handles delivery and tracking.',
  },
];

const differences = [
  ['Useful before signup', 'Create one guest link in a single step. Make an account only when you want persistent links and a dashboard.'],
  ['Fast wherever links travel', 'Requests are handled close to the person opening the link, keeping the redirect path short and responsive.'],
  ['Clear limits', 'Plans explain exactly how many links, subdomains, and days of activity history are included.'],
  ['Branding without extra setup', 'Claim a name under lixrl.com instead of configuring a separate domain and certificate.'],
  ['Built around the link lifecycle', 'Creation, sharing, QR codes, expiry, activity, and editing belong to the same workflow.'],
  ['Control stays visible', 'Existing links remain manageable from the dashboard, with straightforward states and actions.'],
] as const;

export default function AboutPage() {
  const aboutSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: title,
    url: 'https://lixrl.com/about',
    description,
    isPartOf: { '@type': 'WebSite', name: 'Lixrl', url: 'https://lixrl.com' },
  };

  return (
    <div className="theme-light min-h-screen bg-white text-[#111]">
      <Navbar />

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-[#c62828]">About Lixrl</p>
            <h1 className="max-w-3xl text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.045em] text-[#111] sm:text-6xl">
              One link. A clearer way to share.
            </h1>
          </div>
          <div className="lg:pb-1">
            <p className="text-base leading-7 text-[#5f5f66] md:text-lg">
              Lixrl is a URL shortener that turns unwieldy addresses into useful links—and then helps people understand how those links perform.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/" className="rounded-full bg-gradient-to-r from-[#e53935] to-[#c62828] px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-[0_8px_24px_rgba(229,57,53,0.22)]">
                Shorten a link
              </Link>
              <Link href="/pricing" className="rounded-full border border-[#dddddd] bg-white px-5 py-2.5 text-sm font-semibold text-[#352f42] no-underline transition-colors hover:border-[#e53935]">
                Compare plans
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-[#e8e8e8] bg-[#fafafa]" aria-labelledby="what-we-do">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c62828]">What we do</p>
              <h2 id="what-we-do" className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">A complete home for every short link</h2>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[#e5e5e5] bg-[#e5e5e5] md:grid-cols-2">
              {outcomes.map((item) => (
                <article key={item.number} className="bg-white p-6 md:p-8">
                  <span className="font-mono text-xs font-semibold text-[#c62828]">{item.number}</span>
                  <h3 className="mt-5 text-xl font-bold tracking-tight">{item.title}</h3>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-[#66616d]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6 md:py-24" aria-labelledby="why-lixrl">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c62828]">Why Lixrl</p>
              <h2 id="why-lixrl" className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">Less friction at every step</h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#66616d]">
                The product is designed to get out of the way: start quickly, see what matters, and add more control only when you need it.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {differences.map(([heading, body]) => (
                <article key={heading} className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,0.05)]">
                  <h3 className="font-bold text-[#24202b]">{heading}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6a6570]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 md:px-6 md:pb-28">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-7 overflow-hidden rounded-3xl border border-[#f0c8c6] bg-[linear-gradient(135deg,#fff6f5_0%,#ffffff_70%)] p-7 md:flex-row md:items-center md:p-10">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c62828]">Ready when you are</p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">Make the next link easier to share.</h2>
              <p className="mt-2 text-sm text-[#66616d]">Try one guest link for 24 hours, or sign in to keep your work.</p>
            </div>
            <Link href="/" className="shrink-0 rounded-full bg-[#111] px-6 py-3 text-sm font-semibold text-white no-underline transition-transform hover:-translate-y-0.5">
              Create a short link
            </Link>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
        />
      </main>

      <Footer />
    </div>
  );
}
