'use client';

import Link from 'next/link';
import { useState } from 'react';

const ACCENT = '#e53935';
const EMAIL = 'hello@elixpo.com';
const REPO_URL = 'https://github.com/elixpo/elixpourl';
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
const STATUS_URL = 'https://status.elixpo.com';
const ECOSYSTEM_URL = 'https://elixpo.com';
const ABUSE_REPORT_URL = 'https://github.com/elixpo/lixrl.com/issues/new?template=abuse-report.yml';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

const PRODUCT_LINKS: FooterLink[] = [
  { label: 'Sign in with Elixpo', href: '/api/auth/login' },
  { label: 'About', href: '/about' },
  { label: 'QR Generator', href: '/generate' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: '/docs' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Status', href: STATUS_URL, external: true },
];

const RESOURCE_LINKS: FooterLink[] = [
  { label: 'Report abuse', href: ABUSE_REPORT_URL, external: true },
  { label: 'Source on GitHub', href: REPO_URL, external: true },
  { label: 'Accounts SSO', href: 'https://accounts.elixpo.com', external: true },
  { label: 'Elixpo ecosystem', href: ECOSYSTEM_URL, external: true },
  { label: 'Security disclosure', href: 'mailto:hello@elixpo.com?subject=Security%20disclosure%20—%20ElixpoURL', external: true },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: 'License', href: LICENSE_URL, external: true },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Trademark notice', href: `${REPO_URL}/blob/main/LICENSES/exceptions/Oreo-trademarks`, external: true },
];

interface FooterColumnProps {
  title: string;
  links: FooterLink[];
}

function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[#888888]">
        {title}
      </div>
      <ul className="space-y-2 list-none p-0">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a
                href={l.href}
                target={l.href.startsWith('mailto:') ? undefined : '_blank'}
                rel={l.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                className="text-sm text-[#a3a3a3] hover:text-[#ffffff] no-underline transition-colors"
              >
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                className="text-sm text-[#a3a3a3] hover:text-[#ffffff] no-underline transition-colors"
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = EMAIL;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      } catch {
        window.location.href = `mailto:${EMAIL}`;
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <footer
      className="relative z-10 mt-16 md:mt-0"
      style={{ background: '#1c1c1c', color: 'rgba(255,255,255,0.7)' }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-12 md:pt-14 pb-0">
        {/* Top — brand block + four columns */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10 lg:gap-12 pb-12"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Brand */}
          <div className="max-w-[380px]">
            <p
              className="text-[11px] font-bold tracking-[0.12em] uppercase mb-2.5"
              style={{ color: ACCENT }}
            >
              We protect privacy
            </p>
            <h4 className="mb-4 text-[1.15rem] font-bold leading-snug text-[#ffffff]">
              Short links and QR codes,
              <br />
              built to be shared.
            </h4>

            <div className="flex items-center gap-2 mb-3">
              <input
                type="email"
                placeholder="Subscribe to updates"
                disabled
                className="flex-1 px-3.5 py-2 rounded-lg text-[13px] outline-none"
                style={{
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.5)',
                }}
              />
              <span
                className="inline-flex items-center px-3 py-[7px] rounded-lg text-[11px] font-bold tracking-wider whitespace-nowrap"
                style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
              >
                COMING SOON
              </span>
            </div>
            <p className="mb-5 text-xs text-[#888888]">
              Product updates and changelog — subscriptions open soon.
            </p>

            {/* Click-to-copy email pill */}
            <button
              type="button"
              onClick={handleCopyEmail}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-sm text-[#d8d8d8] transition-all"
              style={{
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                fontFamily: 'var(--font-geist-mono), monospace',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.borderColor = 'rgba(229,57,53,0.5)';
                e.currentTarget.style.background = 'rgba(229,57,53,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.background = 'transparent';
              }}
              title={copied ? 'Copied!' : 'Click to copy'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {EMAIL}
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </div>

          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Resources" links={RESOURCE_LINKS} />
          <FooterColumn title="Legal" links={LEGAL_LINKS} />
        </div>

        {/* Bottom strip */}
        <div className="flex flex-col gap-2 py-5 text-[12px] text-[#888888] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1">
            <span>© {new Date().getFullYear()} Elixpo · Edge-native URL shortener</span>
            <span className="hidden text-[#555555] sm:inline">·</span>
            <span>
              Code{' '}
              <a
                href={LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-[#555555] transition-colors hover:text-[#ffffff] hover:decoration-[#aaaaaa]"
              >
                MIT
              </a>
              , assets{' '}
              <a
                href={LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-[#555555] transition-colors hover:text-[#ffffff] hover:decoration-[#aaaaaa]"
              >
                CC-BY-4.0
              </a>
              , brand reserved
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>URL infrastructure for the Elixpo ecosystem</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on GitHub"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[#a3a3a3] no-underline transition-all hover:text-[#ffffff]"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(229,57,53,0.45)';
                e.currentTarget.style.background = 'rgba(229,57,53,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
