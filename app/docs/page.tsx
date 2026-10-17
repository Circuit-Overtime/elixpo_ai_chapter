'use client';

import Link from 'next/link';

const H1 = 'text-[2.1rem] md:text-[2.4rem] font-extrabold tracking-tight text-white mb-4 leading-tight';
const LEDE = 'text-white/70 text-base md:text-[1.05rem] leading-relaxed mb-8';
const H2 = 'text-[1.4rem] font-bold text-white tracking-tight mt-12 mb-3';
const P = 'text-white/70 text-[0.96rem] leading-relaxed mb-4';
const CARD = 'p-5 rounded-xl transition-colors no-underline block';
const CARD_STYLE = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,250,250,0.92) 100%)',
  border: '1px solid rgba(0,0,0,0.10)',
};

export default function OverviewPage() {
  return (
    <article>
      <h1 className={H1}>Overview</h1>
      <p className={LEDE}>
        ElixpoURL is an open URL shortener built on Cloudflare&apos;s edge.
        Short links, click analytics, and a developer-first REST
        API — for any app you ship, Elixpo or not.
      </p>

      <h2 id="what-you-get" className={H2}>What you get</h2>
      <ul className="space-y-2 list-none p-0 mb-6">
        {[
          'Edge-native redirects — short links resolve through Cloudflare\'s global network.',
          'Click analytics — counts, geo, referrers, devices, browsers; no third-party script.',
          'REST API + API keys with scoped permissions.',
          'Custom slugs, bulk deletion, activation controls, and link expiry.',
          'Sign in via Elixpo Accounts SSO — no separate password.',
        ].map((line) => (
          <li key={line} className="text-white/70 text-[0.96rem] flex gap-2.5">
            <span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#e53935]" />
            {line}
          </li>
        ))}
      </ul>

      <h2 id="get-started" className={H2}>Get started</h2>
      <p className={P}>
        Choose the dashboard, Developer CLI, or API depending on how you work.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <Link href="/docs/quickstart" className={CARD} style={CARD_STYLE}>
          <div className="font-semibold text-white mb-1">Quickstart</div>
          <div className="text-sm text-white/55">
            Sign in, mint a key, shorten your first URL in under 5 minutes.
          </div>
        </Link>
        <Link href="/docs/api" className={CARD} style={CARD_STYLE}>
          <div className="font-semibold text-white mb-1">Shortening API</div>
          <div className="text-sm text-white/55">
            Endpoints to create, list, update, and delete short links.
          </div>
        </Link>
        <Link href="/docs/cli" className={CARD} style={CARD_STYLE}>
          <div className="font-semibold text-white mb-1">Developer CLI</div>
          <div className="text-sm text-white/55">
            Shorten links, export analytics, and generate QR codes from a terminal or agent workflow.
          </div>
        </Link>
        <Link href="/docs/analytics" className={CARD} style={CARD_STYLE}>
          <div className="font-semibold text-white mb-1">Click Analytics</div>
          <div className="text-sm text-white/55">
            Pull counts, geo, browser, and referrer breakdowns over any window.
          </div>
        </Link>
        <Link href="/docs/keys" className={CARD} style={CARD_STYLE}>
          <div className="font-semibold text-white mb-1">API Keys</div>
          <div className="text-sm text-white/55">
            Create, rotate, and scope keys for programmatic access.
          </div>
        </Link>
      </div>

      <h2 id="how-auth-works" className={H2}>How sign-in works</h2>
      <p className={P}>
        ElixpoURL doesn&apos;t store passwords. Every user signs in through{' '}
        <a
          href="https://accounts.elixpo.com"
          className="underline decoration-white/30 hover:text-white hover:decoration-white/70 transition-colors"
        >
          Elixpo Accounts SSO
        </a>{' '}
        — the same login that opens chat, art, blogs, and the rest of the
        ecosystem. Hit{' '}
        <a
          href="/api/auth/login"
          className="underline decoration-white/30 hover:text-white hover:decoration-white/70 transition-colors"
        >
          /api/auth/login
        </a>{' '}
        to start the OAuth flow; we handle the callback, set the session
        cookie, and bounce you to your dashboard.
      </p>
      <p className={P}>
        For machine-to-machine access, mint an{' '}
        <Link
          href="/docs/keys"
          className="underline decoration-white/30 hover:text-white hover:decoration-white/70 transition-colors"
        >
          API key
        </Link>{' '}
        from your dashboard and send it in the <code>Authorization</code>{' '}
        header.
      </p>

      <h2 id="conventions" className={H2}>Conventions</h2>
      <ul className="space-y-2 list-none p-0">
        <li className="text-white/70 text-[0.96rem] flex gap-2.5">
          <span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#e53935]" />
          Base URL: <code className="font-mono text-white">https://lixrl.com</code>
        </li>
        <li className="text-white/70 text-[0.96rem] flex gap-2.5">
          <span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#e53935]" />
          API path prefix: <code className="font-mono text-white">/api</code>
        </li>
        <li className="text-white/70 text-[0.96rem] flex gap-2.5">
          <span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#e53935]" />
          All requests/responses are JSON unless stated otherwise.
        </li>
        <li className="text-white/70 text-[0.96rem] flex gap-2.5">
          <span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#e53935]" />
          Errors follow the format <code className="font-mono text-white">{'{ "error": "Human-readable message" }'}</code> — use the HTTP status for program flow and see <Link href="/docs/errors" className="underline decoration-white/30 hover:text-white">Error Reference</Link>.
        </li>
      </ul>
    </article>
  );
}
