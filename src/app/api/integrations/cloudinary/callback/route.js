import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import {
  describeCloudinaryOAuthShape,
  exchangeCloudinaryCode,
  isValidCloudinaryCloudName,
  openCloudinaryOAuthUser,
  resolveCloudinaryCloudName,
  revokeCloudinaryToken,
} from '@/lib/cloudinaryOAuth'
import { saveCloudinaryConnection } from '@/lib/cloudinaryConnections'
import { testCloudinaryOAuthConnection } from '@/lib/personalCloudinary'

export const runtime = 'edge'

function finish(request, result, reference = '') {
  const destination = new URL('/settings?tab=integrations', request.url)
  destination.searchParams.set('cloudinary', result)
  if (reference) destination.searchParams.set('cloudinary_ref', reference)
  const response = NextResponse.redirect(destination)
  response.cookies.delete('cloudinary_oauth_state')
  response.cookies.delete('cloudinary_oauth_cloud_name')
  response.cookies.delete('cloudinary_oauth_user')
  return response
}

export async function GET(request) {
  const callbackUrl = new URL(request.url)
  const authorizationError = callbackUrl.searchParams.get('error')
  if (authorizationError) return finish(request, authorizationError === 'access_denied' ? 'denied' : 'authorization_failed')

  const code = callbackUrl.searchParams.get('code')
  const state = callbackUrl.searchParams.get('state')
  const savedState = request.cookies.get('cloudinary_oauth_state')?.value
  if (!code || !state || !savedState || state !== savedState) return finish(request, 'invalid_state')
  const boundUser = await openCloudinaryOAuthUser(
    request.cookies.get('cloudinary_oauth_user')?.value,
    state,
  )
  const user = boundUser || await getAuthenticatedUser(request)
  if (!user) return finish(request, 'not_authenticated')

  let tokens
  let stage = 'token_exchange'
  const reference = crypto.randomUUID().slice(0, 8)
  try {
    tokens = await exchangeCloudinaryCode({ code, origin: callbackUrl.origin })
    stage = 'offline_access'
    if (!tokens.refresh_token) throw new Error('Offline access did not issue a refresh token')
    stage = 'environment'
    const cloudName = await resolveCloudinaryCloudName(tokens, callbackUrl)
    if (!isValidCloudinaryCloudName(cloudName)) {
      const shape = describeCloudinaryOAuthShape(tokens, callbackUrl)
      throw new Error(`Cloudinary did not identify the product environment; response shape=${JSON.stringify(shape)}`)
    }
    stage = 'validation'
    await testCloudinaryOAuthConnection({ cloudName, oauthToken: tokens.access_token })
    stage = 'persistence'
    const { DB } = getCloudflareBindings()
    if (!user.email) throw new Error('The signed-in account did not provide an email address')
    await DB.prepare(`
      INSERT INTO users (id, email, display_name, provider, last_login_at, created_at)
      VALUES (?, ?, ?, 'elixpo', datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        last_login_at = datetime('now')
    `).bind(user.id, user.email, user.displayName || user.email).run()
    await saveCloudinaryConnection(DB, user.id, {
      cloudName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    })
    return finish(request, 'connected')
  } catch (error) {
    console.error(`[cloudinary/oauth] Callback failed stage=${stage} ref=${reference}:`, error?.message || error)
    if (tokens?.refresh_token) await revokeCloudinaryToken(tokens.refresh_token).catch(() => {})
    return finish(request, `failed_${stage}`, reference)
  }
}
