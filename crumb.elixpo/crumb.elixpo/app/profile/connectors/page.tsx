import { redirect } from 'next/navigation'
import { SiteFooter } from '@/app/components/SiteFooter'
import { SiteHeader } from '@/app/components/SiteHeader'
import { currentUser } from '@/lib/auth'
import { bindings } from '@/lib/cloudflare'
import { MODEL_POLICY } from '@/lib/model-policy'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({ title: 'Pollinations Connector', description: 'Manage the Pollinations connection used by your Crumb account.', path: '/profile/connectors', noIndex: true })

export default async function ConnectorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const user = await currentUser()
  if (!user) redirect('/login?return_to=%2Fprofile%2Fconnectors')
  const connection = await (await bindings()).DB.prepare(`
    SELECT token_expires_at, oauth_scope, updated_at FROM pollinations_connections
    WHERE user_id = ? AND token_expires_at > unixepoch()
  `).bind(user.id).first<{ token_expires_at: number; oauth_scope: string; updated_at: number }>()
  const result = typeof params.pollinations === 'string' ? params.pollinations : ''
  return <><SiteHeader /><main className="account-page"><div className="account-heading"><p className="kicker">Model connection</p><h1>Pollinations, securely connected.</h1><p>Pollinations is the only external connector enabled in this release. Connect it once in the browser, then authorize each Crumb terminal without pasting private keys. <a href="/profile/sessions">Review active website sessions →</a></p></div>
    {result === 'connected' && <div className="notice success-notice">Pollinations is connected. You can now authorize the CLI.</div>}
    {result === 'disconnected' && <div className="notice success-notice">Pollinations is disconnected from Crumb.</div>}
    {['failed', 'denied', 'invalid_session'].includes(result) && <div className="notice error-notice">The Pollinations connection could not be completed. Please try again.</div>}
    {result === 'disconnect_failed' && <div className="notice error-notice">Pollinations could not be disconnected. Refresh the page and try again.</div>}
    <section className="connector-layout"><article className="provider-card"><div className="provider-head"><img className="pollinations-logo" src="/pollinations-favicon.png" alt="Pollinations.ai" width="48" height="48" /><div><p>Model provider</p><h2>Pollinations</h2></div><span className={connection ? 'state connected' : 'state'}>{connection ? 'Connected' : 'Not connected'}</span></div>
      <p className="provider-copy">Crumb uses a scoped connector so your Pollinations key never appears in terminal history or local configuration.</p>
      <div className="model-groups"><div><span>Text harness</span><strong>{MODEL_POLICY.text.join(' · ')}</strong></div><div><span>Images</span><strong>{MODEL_POLICY.image.join(' · ')}</strong></div><div><span>Other modalities</span><strong>One safe default per modality</strong></div></div>
      {connection && <div className="connection-meta"><span>Scope</span><code>{connection.oauth_scope}</code><span>Expires</span><strong>{new Date(connection.token_expires_at * 1000).toLocaleDateString('en-US', { dateStyle: 'medium' })}</strong></div>}
      <div className="provider-actions"><a className="button provider-button" href="/api/integrations/pollinations/connect">{connection ? 'Reconnect Pollinations' : 'Connect Pollinations'} <span>→</span></a>
      {connection && <form method="post" action="/api/integrations/pollinations/disconnect"><button className="button button-secondary provider-button" type="submit">Disconnect Pollinations</button></form>}</div>
    </article><aside className="device-card"><p className="kicker">Next step</p><h2>Authorize this terminal</h2><p>Once Pollinations is connected, open Crumb and start its secure device flow.</p><pre><span>$</span> crumb auth login</pre><ol><li>Crumb displays a verification link.</li><li>Confirm the device in your browser.</li><li>The CLI receives a scoped connector.</li></ol><a href="/docs/authentication">Device flow documentation →</a></aside></section>
  </main><SiteFooter /></>
}
