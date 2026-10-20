import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteFooter } from '@/app/components/SiteFooter'
import { SiteHeader } from '@/app/components/SiteHeader'
import { currentUser } from '@/lib/auth'
import { bindings } from '@/lib/cloudflare'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Active Sessions',
  description: 'Review and revoke active Crumb website sessions.',
  path: '/profile/sessions',
  noIndex: true,
})

interface SessionRow {
  public_id: string
  created_at: number
  expires_at: number
  user_agent: string | null
  current: number
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return 'Unknown browser'
  const os = /Windows/i.test(userAgent) ? 'Windows' : /Macintosh|Mac OS/i.test(userAgent) ? 'macOS' : /Android/i.test(userAgent) ? 'Android' : /iPhone|iPad/i.test(userAgent) ? 'iOS' : /Linux/i.test(userAgent) ? 'Linux' : 'Unknown OS'
  const browser = /Edg\//i.test(userAgent) ? 'Edge' : /Firefox\//i.test(userAgent) ? 'Firefox' : /Chrome\//i.test(userAgent) ? 'Chrome' : /Safari\//i.test(userAgent) ? 'Safari' : 'Browser'
  return `${browser} on ${os}`
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await currentUser()
  if (!user) redirect('/login?return_to=%2Fprofile%2Fsessions')
  const currentToken = (await cookies()).get('crumb_session')?.value || ''
  const sessions = await (await bindings()).DB.prepare(`
    SELECT public_id, created_at, expires_at, user_agent,
      CASE WHEN id = ? THEN 1 ELSE 0 END AS current
    FROM sessions
    WHERE user_id = ? AND expires_at > unixepoch() AND public_id IS NOT NULL
    ORDER BY current DESC, created_at DESC
  `).bind(currentToken, user.id).all<SessionRow>()
  const activeSessions = sessions.results as SessionRow[]
  const result = (await searchParams).result
  return <><SiteHeader /><main className="account-page"><div className="account-heading"><p className="kicker">Account security</p><h1>Active Crumb sessions.</h1><p>These are browser sessions for the Crumb website. Terminal device approvals, passkeys, and MFA remain owned by Elixpo Accounts.</p></div>
    {result === 'revoked' && <div className="notice success-notice">The selected session was revoked.</div>}
    {result === 'missing' && <div className="notice error-notice">That session is no longer active.</div>}
    {result === 'invalid' && <div className="notice error-notice">The session request was invalid.</div>}
    <section className="session-panel"><div className="session-panel-head"><div><p className="kicker">Website sessions</p><h2>{activeSessions.length} active</h2></div><Link href="/profile/connectors">Manage Pollinations →</Link></div>
      <div className="session-list">{activeSessions.map((session: SessionRow) => <article className="session-row" key={session.public_id}><div><strong>{deviceLabel(session.user_agent)}</strong><span>{session.current ? 'This browser · ' : ''}Signed in {new Date(session.created_at * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span><small>Expires {new Date(session.expires_at * 1000).toLocaleDateString('en-US', { dateStyle: 'medium' })}</small></div><form method="post" action="/api/profile/sessions/revoke"><input type="hidden" name="session" value={session.public_id} /><button className="button button-secondary" type="submit">{session.current ? 'Sign out here' : 'Revoke'}</button></form></article>)}</div>
      {!activeSessions.length && <p className="empty-state">No active Crumb website sessions were found.</p>}
    </section>
    <p className="session-boundary">For terminal approvals and account-wide security, open <a href="https://accounts.elixpo.com/dashboard/security">Elixpo Accounts security ↗</a>.</p>
  </main><SiteFooter /></>
}
