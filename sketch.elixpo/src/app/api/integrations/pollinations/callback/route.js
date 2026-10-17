import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import {
  exchangePollinationsCode,
  getPollinationsUserInfo,
  openPollinationsOAuthContext,
  POLLINATIONS_SCOPE,
} from '@/lib/pollinationsOAuth'
import { savePollinationsConnection } from '@/lib/pollinationsConnections'
import { getPollinationsAccountSnapshot } from '@/lib/pollinationsAccount'

export const runtime = 'edge'

function finish(request, result, reference = '') {
  const destination = new URL('/settings?tab=integrations', request.url)
  destination.searchParams.set('pollinations', result)
  if (reference) destination.searchParams.set('pollinations_ref', reference)
  const response = NextResponse.redirect(destination)
  response.cookies.delete('pollinations_oauth_context')
  return response
}

export async function GET(request) {
  const callbackUrl = new URL(request.url)
  const authorizationError = callbackUrl.searchParams.get('error')
  if (authorizationError) return finish(request, authorizationError === 'access_denied' ? 'denied' : 'authorization_failed')

  const code = callbackUrl.searchParams.get('code')
  const state = callbackUrl.searchParams.get('state')
  const context = await openPollinationsOAuthContext(
    request.cookies.get('pollinations_oauth_context')?.value,
    state,
  )
  if (!code || !state || !context) return finish(request, 'invalid_state')

  const reference = crypto.randomUUID().slice(0, 8)
  let stage = 'token_exchange'
  try {
    const tokens = await exchangePollinationsCode({
      code,
      verifier: context.verifier,
      origin: callbackUrl.origin,
    })
    stage = 'scope_validation'
    const grantedScopes = new Set(String(tokens.scope || '').split(/[\s,]+/).filter(Boolean))
    for (const required of POLLINATIONS_SCOPE.split(' ')) {
      if (!grantedScopes.has(required)) throw new Error(`Pollinations did not grant the ${required} scope`)
    }

    stage = 'account_validation'
    const [providerUser, snapshot] = await Promise.all([
      getPollinationsUserInfo(tokens.access_token),
      getPollinationsAccountSnapshot(tokens.access_token),
    ])
    if (!Number.isFinite(snapshot.balance)) throw new Error('Pollinations did not return a valid Pollen balance')

    stage = 'persistence'
    const { DB } = getCloudflareBindings()
    const user = context.user
    if (!user.email) throw new Error('The signed-in account did not provide an email address')
    await DB.prepare(`
      INSERT INTO users (id, email, display_name, provider, last_login_at, created_at)
      VALUES (?, ?, ?, 'elixpo', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        last_login_at = datetime('now')
    `).bind(user.id, user.email, user.displayName || user.email).run()
    await savePollinationsConnection(DB, user.id, {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      providerUserId: providerUser?.sub,
      providerUsername: providerUser?.preferred_username || providerUser?.name,
    })
    return finish(request, 'connected')
  } catch (error) {
    console.error(`[pollinations/oauth] Callback failed stage=${stage} ref=${reference}:`, error?.message || error)
    return finish(request, `failed_${stage}`, reference)
  }
}
