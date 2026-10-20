import Link from 'next/link'
import { currentUser } from '@/lib/auth'
import { config } from '@/lib/cloudflare'
import { AccountMenu } from './AccountMenu'

export async function SiteHeader() {
  const user = await currentUser().catch(() => null)
  const accountsOrigin = (await config()).accountsOrigin
  return <header className="site-header">
    <div className="nav-shell">
      <Link className="brand" href="/" aria-label="Crumb home">
        <img className="brand-logo" src="/favicon.ico" alt="" width="32" height="32" />
        <span>crumb</span><span className="brand-badge">NLT</span>
      </Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <Link href="/features">Features</Link><Link href="/skills">Skills</Link><Link href="/plugins">Plugins</Link><Link href="/profile/connectors">Pollinations</Link><Link href="/docs">Docs</Link><Link href="/about">About</Link>
      </nav>
      <div className="nav-actions">
        {user ? <AccountMenu name={user.displayName} email={user.email} avatarUrl={`${accountsOrigin}/api/avatar/${encodeURIComponent(user.id)}`} accountsOrigin={accountsOrigin} /> : <Link className="button button-small" href="/login">Sign in</Link>}
      </div>
    </div>
  </header>
}
