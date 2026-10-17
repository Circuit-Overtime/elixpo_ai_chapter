'use client';

import Link from 'next/link';

const H1 = 'text-[2.1rem] md:text-[2.4rem] font-extrabold tracking-tight text-white mb-4 leading-tight';
const LEDE = 'text-white/70 text-base md:text-[1.05rem] leading-relaxed mb-8';
const H2 = 'text-[1.4rem] font-bold text-white tracking-tight mt-12 mb-3';
const P = 'text-white/70 text-[0.96rem] leading-relaxed mb-4';
const PRE = 'p-4 rounded-xl text-[0.85rem] leading-relaxed overflow-x-auto mb-6 font-mono';
const PRE_STYLE = {
  background: 'rgba(0,0,0,0.45)',
  border: '1px solid rgba(0,0,0,0.08)',
  color: '#e8e8ed',
};

export default function QuickstartPage() {
  return (
    <article>
      <h1 className={H1}>Quickstart</h1>
      <p className={LEDE}>
        Five minutes from zero to your first short link. You&apos;ll sign in
        through Elixpo Accounts, mint an API key, and shorten a URL from the
        command line.
      </p>

      <h2 id="1-sign-in" className={H2}>1. Sign in with Elixpo</h2>
      <p className={P}>
        ElixpoURL uses your Elixpo account — no separate password to manage.
        Hit the sign-in CTA in the navbar or go directly to{' '}
        <a
          href="/api/auth/login"
          className="underline decoration-white/30 hover:text-white hover:decoration-white/70"
        >
          /api/auth/login
        </a>
        . You&apos;ll be redirected back to your dashboard after the OAuth
        round-trip completes.
      </p>

      <h2 id="2-mint-an-api-key" className={H2}>2. Mint an API key</h2>
      <p className={P}>
        From your dashboard, open{' '}
        <Link
          href="/profile/keys"
          className="underline decoration-white/30 hover:text-white hover:decoration-white/70"
        >
          Profile → API Keys
        </Link>{' '}
        and click <strong>Create key</strong>. Copy the key the moment it
        appears — we hash it on save and you won&apos;t see it again.
      </p>
      <pre className={PRE} style={PRE_STYLE}>
        <code>elu_a1b2c3d4e5f6…  (example, your key will differ)</code>
      </pre>

      <h2 id="3-shorten-your-first-url" className={H2}>
        3. Shorten your first URL
      </h2>
      <p className={P}>
        Send a <code className="font-mono text-white">POST /api/urls</code>{' '}
        with your destination URL and (optionally) a custom slug.
      </p>
      <pre className={PRE} style={PRE_STYLE}>
        <code>{`curl -X POST https://lixrl.com/api/urls \\
  -H "Authorization: Bearer elu_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/your-long-url",
    "title": "Launch announcement",
    "custom_code": "launch"
  }'`}</code>
      </pre>
      <p className={P}>You&apos;ll get back the resolved short link:</p>
      <pre className={PRE} style={PRE_STYLE}>
        <code>{`{
  "short_url": "https://lixrl.com/launch",
  "short_code": "launch",
  "original_url": "https://example.com/your-long-url",
  "title": "Launch announcement",
  "created_at": "2026-03-20T12:00:00Z"
}`}</code>
      </pre>

      <h2 id="4-watch-clicks" className={H2}>4. Watch clicks roll in</h2>
      <p className={P}>
        Every redirect is tracked on Cloudflare&apos;s edge. Pull
        analytics for any link with{' '}
        <code className="font-mono text-white">
          GET /api/urls/{'{code}'}/analytics
        </code>{' '}
        or open it in your dashboard for the visual breakdown — see{' '}
        <Link
          href="/docs/analytics"
          className="underline decoration-white/30 hover:text-white hover:decoration-white/70"
        >
          Click Analytics
        </Link>
        .
      </p>

      <h2 id="whats-next" className={H2}>What&apos;s next</h2>
      <ul className="space-y-2 list-none p-0">
        {[
          ['/docs/api', 'Shortening API reference', 'All endpoints + parameters.'],
          ['/docs/keys', 'API Keys', 'Rotation, scopes, and key hygiene.'],
          ['/docs/webhooks', 'Webhooks', 'Get notified when a link is created or clicked.'],
        ].map(([href, label, blurb]) => (
          <li key={href}>
            <Link
              href={href}
              className="block p-4 rounded-xl no-underline transition-colors"
              style={{
                background:
                  'linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(250,250,250,0.92) 100%)',
                border: '1px solid rgba(0,0,0,0.10)',
              }}
            >
              <div className="font-semibold text-white mb-1">{label}</div>
              <div className="text-sm text-white/55">{blurb}</div>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
