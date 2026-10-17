'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useAuthStore from '@/store/useAuthStore'
import { useTranslation } from '@/hooks/useTranslation'

function OpenCanvasButton({ className }) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { t } = useTranslation()

  const handleClick = () => {
    if (isAuthenticated) {
      router.push('/profile?tab=workspaces')
    } else {
      const id = `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      router.push(`/c/${id}?new=1`)
    }
  }

  return (
    <button onClick={handleClick} className={className}>
      {isAuthenticated ? t('landing.nav.myCanvases') : t('landing.nav.openCanvas')}
    </button>
  )
}

function SignInButton() {
  const login = useAuthStore((state) => state.login)
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => login()}
      title={t('menu.signIn')}
      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border-light bg-white/[0.025] px-3 text-sm text-text-muted transition-all hover:border-[#8b6de0]/60 hover:bg-[#8b6de0]/10 hover:text-white"
    >
      <i className="bx bx-log-in text-base" />
      <span className="hidden sm:inline">{t('menu.signIn')}</span>
    </button>
  )
}

const accountSections = [
  {
    label: 'Workspace',
    items: [
      { href: '/profile?tab=workspaces', label: 'My workspaces', detail: 'Open and manage canvases', icon: 'bx-grid-alt' },
      { action: 'new-canvas', label: 'Create canvas', detail: 'Start a new workspace', icon: 'bx-plus-circle' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/profile?tab=personal', label: 'Personal details', detail: 'Identity and public profile', icon: 'bx-user' },
      { href: '/profile?tab=integrations', label: 'Integrations', detail: 'Cloudinary and Pollinations', icon: 'bx-plug' },
      { href: '/profile?tab=usage', label: 'Usage & limits', detail: 'Storage and collaboration', icon: 'bx-bar-chart-alt-2' },
      { href: '/profile?tab=billing', label: 'Billing & plan', detail: 'Plan and entitlements', icon: 'bx-credit-card' },
    ],
  },
  {
    label: 'Professional',
    items: [
      { href: '/teams', label: 'Teams', detail: 'Collaboration for groups', icon: 'bx-group' },
      { href: '/docs', label: 'Documentation', detail: 'Guides and platform reference', icon: 'bx-book-open' },
    ],
  },
]

function AccountMenu({ onOpenChange }) {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const setMenuOpen = (next) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (event.type === 'mousedown' && ref.current && !ref.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Account'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="landing-account-menu"
        title={`${displayName} · ${user?.email || 'signed in'}`}
        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-1.5 py-1 text-left transition-all duration-200 ${open ? 'border-[#9E91EE]/55 bg-[#8B88E8]/15' : 'border-border-light bg-surface-card/60 hover:border-[#9E91EE]/35 hover:bg-surface-hover'}`}
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-lg border border-white/10 object-cover" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#9E91EE]/25 bg-[#8B88E8]/15 text-xs text-[#C4B8F8]">{initials}</span>
        )}
        <span className="hidden min-w-0 max-w-[168px] lg:block">
          <span className="block truncate text-xs font-medium text-text-primary">{displayName}</span>
          <span className="mt-0.5 block truncate text-[10px] text-text-dim">{user?.email || 'Signed in'}</span>
        </span>
        <i className={`bx bx-chevron-down hidden text-sm text-text-dim transition-transform lg:block ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="landing-account-menu"
            role="menu"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 max-h-[calc(100vh-76px)] w-[calc(100vw-24px)] max-w-[310px] overflow-y-auto rounded-2xl border border-[#8B88E8]/25 bg-[#171120]/98 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 px-2 py-2.5">
              {user?.avatar ? (
                <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-xl border border-white/10 object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#9E91EE]/25 bg-[#8B88E8]/15 text-sm text-[#C4B8F8]">{initials}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">{displayName}</p>
                <p className="mt-0.5 truncate text-[10px] text-text-dim">{user?.email}</p>
                <span className="mt-1.5 inline-flex rounded-full border border-[#8B88E8]/20 bg-[#8B88E8]/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#B9ACF5]">{user?.tier || 'Free'} plan</span>
              </div>
            </div>

            {accountSections.map((section) => (
              <div key={section.label} className="border-t border-white/[0.07] py-1.5 first-of-type:mt-1">
                <p className="px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-text-dim">{section.label}</p>
                {section.items.map((item) => {
                  const content = (
                    <>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[#A99CF1]">
                        <i className={`bx ${item.icon} text-base`} />
                      </span>
                      <span className="min-w-0 text-left">
                        <span className="block text-xs">{item.label}</span>
                        <span className="mt-0.5 block text-[9px] text-text-dim">{item.detail}</span>
                      </span>
                      <i className="bx bx-chevron-right ml-auto text-sm text-text-dim" />
                    </>
                  )
                  const className = 'flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-text-secondary transition-colors hover:bg-[#8B88E8]/10 hover:text-text-primary'
                  if (item.action === 'new-canvas') {
                    return (
                      <button
                        key={item.action}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          const id = `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
                          setMenuOpen(false)
                          router.push(`/c/${id}?new=1&preserveLocal=1`)
                        }}
                        className={className}
                      >
                        {content}
                      </button>
                    )
                  }
                  return (
                    <Link key={item.href} href={item.href} role="menuitem" onClick={() => setMenuOpen(false)} className={className}>
                      {content}
                    </Link>
                  )
                })}
              </div>
            ))}

            <div className="border-t border-white/[0.07] pt-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => { logout(); setMenuOpen(false) }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-xs text-red-400/85 transition-colors hover:bg-red-500/10 hover:text-red-300"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/[0.07]"><i className="bx bx-log-out text-base" /></span>
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const resourceLinks = [
  { href: '/resources/how-to-start', key: 'howToStart', label: 'How to start', icon: 'bx bx-rocket' },
  { href: '/resources/community', key: 'community', label: 'Community', icon: 'bx bx-group' },
  { href: '/resources/security', key: 'security', label: 'Security', icon: 'bx bx-shield' },
]

// Compact star-count formatter: 999 → "999", 1200 → "1.2k", 12345 → "12.3k".
function formatStars(n) {
  if (typeof n !== 'number' || n < 0) return null
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k.toFixed(k < 10 ? 1 : 0).replace(/\.0$/, '')}k`
}

const GH_REPO = 'elixpo/sketch.elixpo'
const STARS_CACHE_KEY = `gh-stars:${GH_REPO}`
const STARS_TTL_MS = 10 * 60 * 1000 // 10 minutes — unauth GitHub API is 60 req/hr

function useGitHubStars(repo) {
  const [stars, setStars] = useState(null)
  useEffect(() => {
    // Serve from localStorage cache if fresh.
    try {
      const cached = localStorage.getItem(STARS_CACHE_KEY)
      if (cached) {
        const { count, at } = JSON.parse(cached)
        if (Date.now() - at < STARS_TTL_MS && typeof count === 'number') {
          setStars(count)
          return
        }
      }
    } catch {
      // localStorage unavailable (SSR, private mode) — fall through to fetch.
    }

    let cancelled = false
    fetch(`https://api.github.com/repos/${repo}`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data.stargazers_count !== 'number') return
        setStars(data.stargazers_count)
        try {
          localStorage.setItem(STARS_CACHE_KEY, JSON.stringify({ count: data.stargazers_count, at: Date.now() }))
        } catch {
          // Storage quota / private mode — ignore; memory state still updates.
        }
      })
      .catch(() => {
        // Network / rate limit — silently leave stars=null; pill renders without the count.
      })
    return () => {
      cancelled = true
    }
  }, [repo])
  return stars
}

export default function LandingNav() {
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const dropdownRef = useRef(null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initAuth = useAuthStore((state) => state.init)
  const stars = useGitHubStars(GH_REPO)
  const starsLabel = formatStars(stars)
  const { t } = useTranslation()

  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    function handleOutsideClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setResourcesOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/5"
    >
      <div className="backdrop-blur-xl bg-[#120e1a]/85 px-6 py-3 flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo */}
        <Link href="/?noredirect=1" className="flex items-center gap-3">
          <img src="/icon.png" alt="LixSketch" className="w-7 h-7 rounded-md" />
          <span className="text-lg tracking-wide text-text-secondary">LixSketch</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-7 text-sm text-text-muted">
          <Link href="/pricing" className="hover:text-text-primary transition-colors">
            {t('landing.nav.pricing')}
          </Link>
          <Link href="/teams" className="hover:text-text-primary transition-colors">
            {t('landing.nav.teams')}
          </Link>
          <Link href="/templates" className="hover:text-text-primary transition-colors">
            {t('landing.nav.templates')}
          </Link>
          <Link href="/docs" className="hover:text-text-primary transition-colors">
            {t('landing.resources.docs')}
          </Link>

          {/* Resources dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setResourcesOpen(!resourcesOpen)}
              className="flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer"
            >
              {t('landing.nav.resources')}
              <i className={`bx bx-chevron-down text-base transition-transform duration-200 ${resourcesOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {resourcesOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-2 w-52 bg-surface-card border border-border-light rounded-xl overflow-hidden shadow-2xl shadow-black/40"
                >
                  {resourceLinks.map((item) => {
                    const Tag = item.external ? 'a' : Link
                    const extraProps = item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
                    return (
                      <Tag
                        key={item.href}
                        href={item.href}
                        onClick={() => setResourcesOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-150 text-sm"
                        {...extraProps}
                      >
                        <i className={`${item.icon} text-base text-text-dim`} />
                        {t(`landing.resources.${item.key}`)}
                        {item.external && <i className="bx bx-link-external text-xs text-text-dim ml-auto" />}
                      </Tag>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <a
            href={`https://github.com/${GH_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={starsLabel ? `GitHub · ${starsLabel} stars` : 'GitHub'}
            title={starsLabel ? `${stars.toLocaleString()} stars on GitHub` : 'GitHub'}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-muted hover:text-text-primary border border-border-light hover:border-white/20 rounded-lg transition-all duration-200"
          >
            <i className="bx bxl-github text-lg" />
            <i className="bx bx-star text-sm" />
            {starsLabel && <span className="tabular-nums text-xs font-medium">{starsLabel}</span>}
            <span className="hidden lg:inline">{t('links.github')}</span>
          </a>

          <OpenCanvasButton className="px-4 py-2 cursor-pointer bg-accent-blue hover:bg-accent-blue-hover text-white text-sm rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-accent-blue/20" />
          {isAuthenticated ? (
            <AccountMenu onOpenChange={(open) => {
              if (open) {
                setResourcesOpen(false)
                setMobileOpen(false)
              }
            }} />
          ) : (
            <SignInButton />
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <i className={`bx ${mobileOpen ? 'bx-x' : 'bx-menu'} text-2xl`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden backdrop-blur-xl bg-[#120e1a]/95 border-b border-white/5 overflow-hidden"
          >
            <div className="px-6 py-4 flex flex-col gap-1">
              {[
                { href: '/pricing', labelKey: 'pricing' },
                { href: '/teams', labelKey: 'teams' },
                { href: '/templates', labelKey: 'templates' },
                { href: '/docs', labelKey: 'docs', isResource: true },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="py-2.5 text-text-muted hover:text-text-primary transition-colors text-sm"
                >
                  {item.isResource ? t(`landing.resources.${item.labelKey}`) : t(`landing.nav.${item.labelKey}`)}
                </Link>
              ))}

              <div className="py-2 text-text-dim text-xs uppercase tracking-wider mt-2">{t('landing.nav.resources')}</div>
              {resourceLinks.map((item) => {
                const Tag = item.external ? 'a' : Link
                const extraProps = item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
                return (
                  <Tag
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 py-2 text-text-muted hover:text-text-primary transition-colors text-sm pl-1"
                    {...extraProps}
                  >
                    <i className={`${item.icon} text-sm text-text-dim`} />
                    {t(`landing.resources.${item.key}`)}
                    {item.external && <i className="bx bx-link-external text-xs text-text-dim ml-1" />}
                  </Tag>
                )
              })}

              <a
                href="https://github.com/elixpo/sketch.elixpo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-2.5 text-text-muted hover:text-text-primary transition-colors text-sm mt-2 border-t border-white/5 pt-3"
              >
                <i className="bx bxl-github text-base" />
                <i className="bx bx-star text-sm" />
                {t('landing.nav.starUs')}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
