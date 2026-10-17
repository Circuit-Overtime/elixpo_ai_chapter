'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const REPO_URL = 'https://github.com/elixpo/elixpourl';
const ACCENT = '#e53935';

const Icons = {
  qr: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="12" y="2.5" width="5.5" height="5.5" rx="1" />
      <rect x="2.5" y="12" width="5.5" height="5.5" rx="1" />
      <path d="M12 12h2v2h3.5M12 17.5v-2h2" />
    </svg>
  ),
  about: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5M10 6.25h.01" />
    </svg>
  ),
  pricing: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <path d="M3 7.5L9 2.5a2 2 0 012.6 0l5.4 4.5a2 2 0 01.7 1.5V16a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 011-1.5z" />
      <circle cx="10" cy="9" r="1.5" />
    </svg>
  ),
  docs: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <path d="M5 3h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M6 7h6M6 10h6M6 13h4" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
      <rect x="2.5" y="2.5" width="6.5" height="7.5" rx="1.5" />
      <rect x="11" y="2.5" width="6.5" height="4.5" rx="1.5" />
      <rect x="2.5" y="12.5" width="6.5" height="5" rx="1.5" />
      <rect x="11" y="9.5" width="6.5" height="8" rx="1.5" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  github: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
};

const NAV = [
  { href: '/about', label: 'About', icon: Icons.about },
  { href: '/generate', label: 'QR Generator', icon: Icons.qr },
  { href: '/pricing', label: 'Pricing', icon: Icons.pricing },
  { href: '/docs', label: 'Docs', icon: Icons.docs },
];

export default function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => setIsLoggedIn(res.ok))
      .catch(() => setIsLoggedIn(false));
  }, []);

  // Close the mobile menu on route change.
  useEffect(() => setMenuOpen(false), [pathname]);

  const links = [...NAV, ...(isLoggedIn ? [{ href: '/dashboard', label: 'Dashboard', icon: Icons.dashboard }] : [])];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{ background: 'rgba(255, 255, 255, 0.92)', borderBottom: '1px solid var(--line)' }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-[60px] flex items-center gap-3">
        {/* Brand */}
        <Link href="/?noredirect=1" className="flex items-center gap-2.5 no-underline text-[#111] shrink-0">
          <img src="/base_logo.png" alt="ElixpoURL" width={30} height={30} className="rounded-lg" />
          <span className="font-bold text-[1.05rem] tracking-tight text-[#111]">
            Elixpo<span style={{ color: ACCENT }}>URL</span>
          </span>
          <span
            className="hidden sm:inline-flex items-center text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: '#f5f5f5', color: '#555', border: '1px solid var(--line)' }}
          >
            EDGE
          </span>
        </Link>

        <div className="flex-1" />

        {/* Desktop nav — icon + text */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg no-underline transition-colors"
              style={{
                color: isActive(l.href) ? '#111' : '#555',
                background: isActive(l.href) ? 'var(--accent-dim)' : 'transparent',
              }}
            >
              <span style={{ color: isActive(l.href) ? ACCENT : 'currentColor' }}>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 ml-1">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            title="View source on GitHub"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-[#555] hover:text-[#111] no-underline transition-all"
            style={{ border: '1px solid var(--line)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#bbb')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
          >
            {Icons.github}
            ★ 1
          </a>

          <Link
            href={isLoggedIn ? '/dashboard' : '/api/auth/login'}
            className="hidden sm:inline-flex items-center gap-2 px-[18px] py-2 rounded-full font-semibold text-sm text-white no-underline transition-colors"
            style={{ background: ACCENT }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#c62828')}
            onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT)}
          >
            {isLoggedIn ? 'Dashboard' : 'Sign in'}
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden w-[38px] h-[38px] flex items-center justify-center rounded-[10px] text-[#111] cursor-pointer bg-transparent"
            style={{ border: '1px solid var(--line)' }}
          >
            {menuOpen ? Icons.close : Icons.menu}
          </button>
        </div>
      </div>

      {/* Mobile menu sheet */}
      {menuOpen && (
        <div
          className="md:hidden px-4 pb-4 pt-1 flex flex-col gap-1"
          style={{ background: 'rgba(255,255,255,0.98)', borderBottom: '1px solid var(--line)' }}
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-3 px-3 py-2.5 rounded-lg no-underline text-sm transition-colors"
              style={{
                color: isActive(l.href) ? '#111' : '#333',
                background: isActive(l.href) ? 'var(--accent-dim)' : 'transparent',
              }}
            >
              <span style={{ color: isActive(l.href) ? ACCENT : '#888' }}>{l.icon}</span>
              {l.label}
            </Link>
          ))}
          <div className="flex items-center gap-2 mt-2">
            <Link
              href={isLoggedIn ? '/dashboard' : '/api/auth/login'}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm text-white no-underline"
              style={{ background: ACCENT }}
            >
              {isLoggedIn ? 'Open dashboard' : 'Sign in with Elixpo'}
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
              className="w-[42px] h-[42px] flex items-center justify-center rounded-[10px] text-[#555]"
              style={{ border: '1px solid var(--line)' }}
            >
              {Icons.github}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
