'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import Footer from './components/Footer';
import Navbar from './components/Navbar';

const ACCENT = '#e53935';

/* ── Icons (inline SVG, stroke = currentColor) ──────────────────────────── */

function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const SignInIcon = () => (
  <Icon size={18}>
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);
const ShortenIcon = () => (
  <Icon size={18}>
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </Icon>
);
const TrackIcon = () => (
  <Icon size={18}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Icon>
);

const BoltIcon = () => (
  <Icon>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </Icon>
);
const ChartIcon = () => (
  <Icon>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Icon>
);
const SlugIcon = () => (
  <Icon>
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </Icon>
);
const QrIcon = () => (
  <Icon>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M21 14v7h-7v-3" />
  </Icon>
);
const DomainIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
  </Icon>
);
const ApiIcon = () => (
  <Icon>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon size={16}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </Icon>
);
/* ── Content (unchanged copy) ──────────────────────────────────────────── */

const REGIONS = [
  'North America',
  'Europe',
  'Asia Pacific',
  'South America',
  'Africa',
  'Middle East',
];

const STEPS: { n: string; icon: ReactNode; title: string; body: string }[] = [
  {
    n: '01',
    icon: <SignInIcon />,
    title: 'Sign in',
    body: 'Authenticate with your Elixpo account — no separate signup, no password to remember.',
  },
  {
    n: '02',
    icon: <ShortenIcon />,
    title: 'Shorten',
    body: 'Paste a long URL, pick a slug or let us mint one, and your link goes live on the edge.',
  },
  {
    n: '03',
    icon: <TrackIcon />,
    title: 'Track',
    body: 'Watch clicks, countries, and referrers from the dashboard — or call the API and pipe them anywhere.',
  },
];

const FEATURES: { icon: ReactNode; title: string; body: string; href?: string }[] = [
  {
    icon: <BoltIcon />,
    title: 'Edge-native redirects',
    body: "Links resolve through Cloudflare's global edge, close to the visitor and without an application proxy hop.",
  },
  {
    icon: <ChartIcon />,
    title: 'Click analytics',
    body: 'Bot-filtered counts with country, referrer, and device breakdowns. No third-party tracking script is required.',
  },
  {
    icon: <SlugIcon />,
    title: 'Custom slugs',
    body: 'Choose the slug yourself or generate a short one. Collision checks run at write time so a link is never ambiguous.',
  },
  {
    icon: <QrIcon />,
    title: 'Quick QR code generator',
    body: 'Turn any URL into a QR code, export SVG, PNG, or JPG, and unlock custom styles, logos, and scan tracking when needed.',
    href: '/generate',
  },
  {
    icon: <DomainIcon />,
    title: 'Safety screening',
    body: 'Destinations are validated and checked against known phishing and malware signals when links are created or changed.',
  },
  {
    icon: <ApiIcon />,
    title: 'REST API',
    body: 'Create, list, and revoke links with scoped API keys and predictable JSON. Drop it into any app you ship.',
  },
];

const USE_CASES = [
  'Campaign links',
  'Social bios',
  'QR codes for print',
  'API integrations',
  'Expiring event links',
  'Developer tooling',
];

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [guestUrl, setGuestUrl] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');
  const [guestResult, setGuestResult] = useState<{
    short_url: string;
    expires_at: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function shortenGuestUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuestLoading(true);
    setGuestError('');
    setGuestResult(null);
    setCopied(false);

    try {
      const response = await fetch('/api/guest/urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: guestUrl }),
      });
      const data = (await response.json()) as {
        error?: string;
        short_url?: string;
        expires_at?: string;
      };
      if (!response.ok || !data.short_url || !data.expires_at) {
        setGuestError(data.error || 'Could not shorten this URL');
        return;
      }
      setGuestResult({
        short_url: data.short_url,
        expires_at: data.expires_at,
      });
    } catch {
      setGuestError('Could not reach the shortener. Please try again.');
    } finally {
      setGuestLoading(false);
    }
  }

  async function copyGuestUrl() {
    if (!guestResult) return;
    await navigator.clipboard.writeText(guestResult.short_url);
    setCopied(true);
  }

  return (
    <div className="min-h-screen flex flex-col text-[#111] bg-white">
      <Navbar />

      {/* ── Hero — asymmetric split with link-preview mock ──────────────── */}
      <section className="px-6 pt-16 md:pt-20 pb-16">
        <div className="max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-4 items-center">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-[0.08em] uppercase mb-7"
              style={{ background: 'var(--accent-dim)', color: ACCENT, border: '1px solid var(--accent-border)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
              Edge-native URL shortener
            </div>
            <h1 className="font-black leading-[1.05] tracking-[-0.03em] text-[#111] text-[clamp(2.4rem,5.5vw,4.4rem)] mb-6">
              Short links.
              <br />
              <span className="italic font-bold text-[#888]">Real tracking.</span>
              <br />
              No plumbing.
            </h1>
            <p className="text-[1.05rem] leading-relaxed text-[#555] max-w-[480px] mx-auto lg:mx-0 mb-9">
              Paste a URL, get a link that resolves through Cloudflare&apos;s global edge —
              with click analytics, custom slugs, and a REST API, all from one
              dashboard.
            </p>
            <Link
              href="/docs/cli"
              className="btn-glass inline-flex items-center gap-2 no-underline"
              style={{ borderRadius: 9, padding: '10px 16px', fontSize: 14 }}
            >
              Developer CLI
              <ArrowIcon />
            </Link>
          </div>

          {/* Static brand artwork — blends into the white hero surface. */}
          <div
            className="hidden md:flex w-full min-w-0 items-center justify-center lg:justify-end lg:overflow-visible"
            aria-hidden="true"
          >
            <Image
              src="/hero-link-shortener.webp"
              alt=""
              width={1536}
              height={1024}
              priority
              sizes="(min-width: 1024px) 46vw, 72vw"
              className="w-full max-w-[720px] h-auto select-none mix-blend-multiply lg:w-[112%] lg:max-w-none"
            />
          </div>
        </div>

        <form
          onSubmit={shortenGuestUrl}
          className="w-full max-w-[1240px] mx-auto mt-8 lg:mt-4"
        >
          <div
            className="flex flex-col sm:flex-row gap-2 rounded-xl p-2 bg-white"
            style={{
              border: '1px solid var(--line)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.07)',
            }}
          >
            <label htmlFor="guest-url" className="sr-only">
              URL to shorten
            </label>
            <input
              id="guest-url"
              type="url"
              required
              inputMode="url"
              autoComplete="url"
              placeholder="https://your-long-url.com"
              value={guestUrl}
              onChange={(event) => setGuestUrl(event.target.value)}
              className="min-w-0 flex-1 px-4 py-3 text-[15px] text-[#111] bg-transparent outline-none"
            />
            <button
              type="submit"
              disabled={guestLoading}
              className="btn-accent justify-center sm:min-w-[260px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {guestLoading
                ? 'Shortening…'
                : 'Shorten Your URL in 1 Click'}
            </button>
          </div>
          <div className="min-h-6 mt-2 text-left">
            {guestError && (
              <p className="text-[12px] text-red-600" role="alert">
                {guestError}{' '}
                <Link href="/api/auth/login?return_to=/dashboard" className="font-semibold underline">
                  Create an account
                </Link>
              </p>
            )}
            {guestResult && (
              <div
                className="rounded-xl p-3 text-[13px]"
                style={{
                  background: 'var(--accent-dim)',
                  border: '1px solid var(--accent-border)',
                }}
              >
                <div className="flex items-center gap-2">
                  <a
                    href={guestResult.short_url}
                    className="font-mono font-bold truncate"
                    style={{ color: ACCENT }}
                  >
                    {guestResult.short_url}
                  </a>
                  <button
                    type="button"
                    onClick={copyGuestUrl}
                    className="ml-auto font-semibold shrink-0"
                    style={{ color: ACCENT }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1 text-[#555]">
                  Expires in 24 hours.{' '}
                  <Link href="/api/auth/login?return_to=/dashboard" className="font-semibold underline">
                    Create an account
                  </Link>{' '}
                  to keep links and manage them.
                </p>
              </div>
            )}
            {!guestError && !guestResult && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[12px] text-[#777]">
                <p>
                  One guest link, valid for 24 hours. Sign in for persistent
                  links.
                </p>
                <div className="flex items-center gap-4 shrink-0">
                  <Link
                    href="/api/auth/login?return_to=/dashboard"
                    className="font-semibold no-underline"
                    style={{ color: ACCENT }}
                  >
                    Sign in for persistent links
                  </Link>
                  <Link
                    href="/docs"
                    className="text-[#555] no-underline hover:text-[#111]"
                  >
                    Explore the docs →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </form>
      </section>

      {/* ── Edge network strip ──────────────────────────────────────────── */}
      <div className="py-7 px-6 text-center" style={{ background: 'var(--bg-cream)' }}>
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#888] mb-[18px]">
          Resolves on Cloudflare&apos;s global network
        </p>
        <div className="flex items-center justify-center gap-10 flex-wrap">
          {REGIONS.map((r) => (
            <span key={r} className="text-[15px] font-semibold text-[#aaa] tracking-[-0.01em]">
              {r}
            </span>
          ))}
        </div>
      </div>

      {/* ── How it works — horizontal numbered rail ──────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-[1000px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-14">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase mb-3" style={{ color: ACCENT }}>
                How it works
              </p>
              <h2 className="font-extrabold tracking-[-0.03em] text-[clamp(2rem,4.5vw,2.8rem)] text-[#111]">
                Live in three steps
              </h2>
            </div>
            <p className="text-[#555] leading-relaxed max-w-[340px] text-[0.95rem]">
              Sign in, shorten a URL, then watch the clicks — no redirect
              middleware, no separate account.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className="relative px-0 md:px-8 py-8 md:py-0"
              >
                <div className="md:absolute md:-top-3 md:left-8 flex items-center gap-3 mb-4">
                  <span className="text-[2.2rem] font-black leading-none" style={{ color: 'var(--accent-border)' }}>
                    {s.n}
                  </span>
                  <span
                    className="w-9 h-9 rounded-lg grid place-items-center"
                    style={{ background: 'var(--accent-dim)', color: ACCENT }}
                  >
                    {s.icon}
                  </span>
                </div>
                <h3 className="text-[1.05rem] font-bold text-[#111] mb-2 md:mt-10">{s.title}</h3>
                <p className="text-[0.9rem] leading-relaxed text-[#555] max-w-[280px]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature bento ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6" style={{ background: 'var(--bg-cream)' }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-14">
            <h2 className="font-extrabold tracking-[-0.03em] text-[clamp(2rem,4.5vw,2.8rem)] text-[#111] max-w-[480px]">
              Everything a link should do
            </h2>
            <p className="text-[#555] leading-relaxed max-w-[360px] text-[0.95rem]">
              Redirects, analytics, styled QR codes, and an API behind one dashboard —
              so you ship the link and skip the plumbing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-7 flex flex-col gap-3 bg-white transition-all duration-200"
                style={{ border: '1px solid #ede9e3' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-border)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#ede9e3';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0" style={{ color: ACCENT }}>
                    {f.icon}
                  </div>
                  <h3 className="text-[1rem] font-bold text-[#111]">{f.title}</h3>
                </div>
                <p className="text-[0.875rem] leading-relaxed text-[#555] flex-1">{f.body}</p>
                <Link
                  href={f.href || '/docs'}
                  className="text-[13px] font-semibold no-underline inline-flex items-center gap-1 self-start"
                  style={{ color: ACCENT }}
                >
                  Learn more →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ──────────────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-[1000px] mx-auto flex flex-col md:flex-row md:items-center gap-8 md:gap-14">
          <div className="md:max-w-[280px]">
            <p className="text-[11px] font-bold tracking-[0.14em] uppercase mb-3" style={{ color: ACCENT }}>
              Built for every link moment
            </p>
            <h2 className="font-extrabold tracking-[-0.03em] text-[1.7rem] text-[#111]">
              Every use case, one tool
            </h2>
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {USE_CASES.map((u) => (
              <div
                key={u}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-medium text-[#111]"
                style={{ background: 'var(--bg-cream)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCENT }} />
                {u}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API teaser — flipped: code on the left, copy on the right ────────── */}
      <section className="py-20 px-6" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="flex flex-col-reverse md:flex-row items-center gap-12">
            {/* code artifact — light terminal, no dark chrome */}
            <div
              aria-hidden
              className="flex-1 w-full max-w-[520px] rounded-2xl overflow-hidden select-none"
              style={{ border: '1px solid var(--line)', boxShadow: '0 12px 32px rgba(0,0,0,0.06)' }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ background: 'var(--bg-cream)', borderBottom: '1px solid var(--line)' }}
              >
                <span className="text-[11px] font-bold tracking-[0.06em] uppercase" style={{ color: ACCENT }}>
                  POST
                </span>
                <span className="text-[12px] font-mono text-[#888]">api.lixrl.com/v1/links</span>
              </div>
              <pre className="p-5 text-[12.5px] leading-[1.8] overflow-x-auto m-0 font-mono bg-white">
                <code>
                  <span className="text-[#aaa]">{'$ '}</span>
                  <span style={{ color: ACCENT }}>curl</span>
                  <span className="text-[#333]">{' -X POST api.lixrl.com/v1/links \\'}</span>
                  {'\n'}
                  <span className="text-[#333]">{'    -H '}</span>
                  <span className="text-[#b8860b]">{'"Authorization: Bearer $KEY"'}</span>
                  <span className="text-[#333]">{' \\'}</span>
                  {'\n'}
                  <span className="text-[#333]">{'    -d '}</span>
                  <span className="text-[#b8860b]">{'\'{"url":"https://elixpo.com","slug":"home"}\''}</span>
                  {'\n\n'}
                  <span className="text-[#aaa]">{'{'}</span>
                  {'\n'}
                  <span className="text-[#aaa]">{'  '}</span>
                  <span className="text-[#7c3aed]">{'"short"'}</span>
                  <span className="text-[#333]">{': '}</span>
                  <span style={{ color: '#16a34a' }}>{'"https://lixrl.com/home"'}</span>
                  <span className="text-[#333]">{','}</span>
                  {'\n'}
                  <span className="text-[#aaa]">{'  '}</span>
                  <span className="text-[#7c3aed]">{'"clicks"'}</span>
                  <span className="text-[#333]">{': '}</span>
                  <span className="text-[#2563eb]">{'0'}</span>
                  {'\n'}
                  <span className="text-[#aaa]">{'}'}</span>
                </code>
              </pre>
            </div>

            <div className="flex-1 md:max-w-[400px] text-center md:text-left">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase mb-3" style={{ color: ACCENT }}>
                For developers
              </p>
              <h3 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold tracking-[-0.025em] text-[#111] mb-3">
                One POST and you have a link
              </h3>
              <p className="text-[0.95rem] leading-relaxed text-[#555] mb-6">
                Authenticate with a scoped API key, send the destination, and
                get back the short URL plus its analytics handle. The same
                endpoints that power the dashboard are open to you.
              </p>
              <Link href="/docs/api" className="btn-glass" style={{ borderRadius: 8, padding: '9px 18px', fontSize: 14 }}>
                Explore the API →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing teaser — inline banner, not centered block ────────────── */}
      <section className="py-12 px-6" style={{ borderTop: '1px solid var(--line)' }}>
        <div
          className="max-w-[1000px] mx-auto rounded-2xl px-8 py-7 flex flex-col sm:flex-row items-center justify-between gap-5"
          style={{ background: 'var(--bg-cream)' }}
        >
          <div className="text-center sm:text-left">
            <h2 className="font-extrabold tracking-[-0.02em] text-[1.4rem] text-[#111] mb-1">
              Pricing that scales with you
            </h2>
            <p className="text-[0.9rem] text-[#555]">
              Start free, upgrade when you need custom slugs, deeper analytics, and higher limits.
            </p>
          </div>
          <Link href="/pricing" className="btn-accent shrink-0">
            See pricing
            <ArrowIcon />
          </Link>
        </div>
      </section>

      {/* ── Final CTA — light split panel instead of dark gradient band ──── */}
      <div className="px-6 pb-20 pt-4">
        <div
          className="max-w-[1000px] mx-auto rounded-[20px] overflow-hidden grid grid-cols-1 md:grid-cols-[1.2fr_1fr]"
          style={{ border: '1px solid var(--line)' }}
        >
          <div className="p-10 md:p-12">
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold text-[#111] tracking-[-0.02em] mb-3">
              Mint your first short link
            </h2>
            <p className="text-[0.95rem] text-[#555] max-w-[420px] mb-7 leading-relaxed">
              Sign in with your Elixpo account, shorten a URL, and grab an API
              key — free tier, no credit card.
            </p>
            <Link href="/api/auth/login?return_to=/dashboard" className="btn-accent">
              Sign in with Elixpo
              <ArrowIcon />
            </Link>
          </div>
          <div className="hidden md:flex items-center justify-center p-10" style={{ background: '#16192a' }}>
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.12em] text-white/40 mb-2">Free tier</p>
              <p className="text-white text-[2.6rem] font-black leading-none">
                $0<span className="text-base font-bold text-white/40">/mo</span>
              </p>
              <p className="text-white/50 text-[13px] mt-2">No credit card</p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
