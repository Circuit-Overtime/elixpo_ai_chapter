'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { GitHubIcon } from './GitHubIcon'

function Icon({ name }: { name: 'plug' | 'terminal' | 'user' | 'shield' | 'services' | 'docs' | 'mail' | 'logout' }) {
  const paths = {
    plug: <><path d="M8 12h8M9 7v5m6-5v5M7 12h10v2a5 5 0 0 1-10 0v-2Z" /><path d="M12 19v3" /></>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3m5 0h5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    services: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    docs: <><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4V4Z" /><path d="M5 16V4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function AccountMenu({ name, email, avatarUrl, accountsOrigin }: { name: string; email: string; avatarUrl: string; accountsOrigin: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function close(event: MouseEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [])

  return <div className="account-menu" ref={root}>
    <button className="account-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-haspopup="menu">
      <img src={avatarUrl} alt="" /><span><strong>{name}</strong><small>{email}</small></span><svg className={open ? 'open' : ''} viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="m6 8 4 4 4-4" /></svg>
    </button>
    {open && <div className="account-popover" role="menu">
      <div className="account-card"><img src={avatarUrl} alt="" /><div><strong>{name}</strong><span>{email}</span></div><b><i /> Connected</b></div>
      <div className="menu-section"><p>Crumb platform</p><Link href="/profile/connectors" onClick={() => setOpen(false)}><Icon name="plug" /><span><b>Pollinations</b><small>Model connection</small></span><em>→</em></Link><Link href="/profile/sessions" onClick={() => setOpen(false)}><Icon name="shield" /><span><b>Active sessions</b><small>Review browser access</small></span><em>→</em></Link><Link href="/docs/authentication" onClick={() => setOpen(false)}><Icon name="terminal" /><span><b>CLI authentication</b><small>Devices and secure sign-in</small></span><em>→</em></Link></div>
      <div className="menu-section"><p>Elixpo account</p><a href={`${accountsOrigin}/dashboard/profile`}><Icon name="user" /><span><b>Profile</b><small>Identity and preferences</small></span><em>↗</em></a><a href={`${accountsOrigin}/dashboard/security`}><Icon name="shield" /><span><b>Security</b><small>Sessions, passkeys, and MFA</small></span><em>↗</em></a><a href={`${accountsOrigin}/dashboard/services`}><Icon name="services" /><span><b>Connected services</b><small>Review account access</small></span><em>↗</em></a></div>
      <div className="menu-resources"><Link href="/docs" onClick={() => setOpen(false)}><Icon name="docs" />Docs</Link><a href="mailto:hello@elixpo.com"><Icon name="mail" />Support</a><a href="https://github.com/elixpo/crumb.elixpo" target="_blank" rel="noreferrer"><GitHubIcon />Source</a></div>
      <form className="account-signout" action="/api/auth/logout" method="post"><button type="submit"><Icon name="logout" />Sign out</button></form>
    </div>}
  </div>
}
