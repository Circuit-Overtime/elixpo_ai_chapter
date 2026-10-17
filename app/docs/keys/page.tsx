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

export default function KeysPage() {
  return (
    <article>
      <h1 className={H1}>API Keys</h1>
      <p className={LEDE}>
        API keys authenticate machine-to-machine requests. Human users sign
        in through Elixpo Accounts SSO — keys are only for code that
        ElixpoURL on your behalf.
      </p>

      <h2 id="creating-a-key" className={H2}>Creating a key</h2>
      <p className={P}>
        Open{' '}
        <Link
          href="/profile/keys"
          className="underline decoration-white/30 hover:text-white hover:decoration-white/70"
        >
          Profile → API Keys
        </Link>{' '}
        and click <strong>Create key</strong>. Name it after the app or
        environment it&apos;s for (e.g. <em>blog-prod</em>,{' '}
        <em>ci-pipeline</em>) so you can rotate it later without guesswork.
      </p>

      <h2 id="format" className={H2}>Format</h2>
      <p className={P}>
        Keys contain 32 cryptographically random alphanumeric characters with the prefix{' '}
        <code className="font-mono text-white">elu_</code>:
      </p>
      <pre className={PRE} style={PRE_STYLE}>
        <code>elu_a1b2c3d4e5f67890abcdef1234567890</code>
      </pre>
      <p className={P}>
        We hash keys on the server with SHA-256 and only the prefix is kept in
        the clear. <strong>We can&apos;t recover a lost key</strong> — if
        you lose it, revoke it and mint a new one.
      </p>

      <h2 id="sending-the-key" className={H2}>Sending the key</h2>
      <pre className={PRE} style={PRE_STYLE}>
        <code>Authorization: Bearer elu_YOUR_API_KEY</code>
      </pre>
      <p className={P}>
        Anything else (query strings, cookies, custom headers) is ignored —
        keys go in <code className="font-mono text-white">Authorization</code>{' '}
        only.
      </p>

      <h2 id="rotation" className={H2}>Rotation</h2>
      <ul className="space-y-2 list-none p-0 mb-6">
        {[
          'Rotate keys at least every 90 days, or immediately if you suspect a leak.',
          'Create the new key first, deploy it, verify it works, then revoke the old one.',
          'Multiple active keys per account are fine — they\'re cheap to mint and revoke.',
        ].map((line) => (
          <li key={line} className="text-white/70 text-[0.96rem] flex gap-2.5">
            <span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#e53935]" />
            {line}
          </li>
        ))}
      </ul>

      <h2 id="scopes" className={H2}>Scopes</h2>
      <p className={P}>
        Choose <code className="font-mono text-white">read</code> for list,
        detail, analytics, and export requests. Choose{' '}
        <code className="font-mono text-white">read,write</code> when an
        integration must also create, update, disable, or delete links.
        A read-only key is rejected from mutation endpoints.
      </p>

      <h2 id="limits" className={H2}>Limits</h2>
      <p className={P}>
        Your tier&apos;s quota applies per account, not per key. See{' '}
        <Link
          href="/pricing"
          className="underline decoration-white/30 hover:text-white hover:decoration-white/70"
        >
          Pricing
        </Link>{' '}
        for current limits.
      </p>
    </article>
  );
}
