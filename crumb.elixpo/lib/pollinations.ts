import { config, originFor } from '@/lib/cloudflare'
import { encode, randomToken, text } from '@/lib/encoding'
import { CONNECTOR_MODELS } from '@/lib/model-policy'

const AUTHORIZE = 'https://enter.pollinations.ai/authorize'
const TOKEN = 'https://enter.pollinations.ai/api/oauth/token'
export const SCOPE = 'profile usage'

export function verifier(): string {
  return randomToken(48)
}

export async function challenge(value: string): Promise<string> {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', text(value))))
}

export async function authorizeUrl(state: string, pkce: string, requestUrl: string): Promise<string> {
  const key = (await config()).pollinationsAppKey
  if (!key?.startsWith('pk_')) throw new Error('Pollinations App Key is not configured')
  const url = new URL(AUTHORIZE)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: key,
    redirect_uri: `${originFor(requestUrl)}/api/integrations/pollinations/callback`,
    scope: SCOPE,
    models: CONNECTOR_MODELS.join(','),
    expiry: '30',
    state,
    code_challenge: pkce,
    code_challenge_method: 'S256',
  }).toString()
  return url.toString()
}

export async function exchangeCode(code: string, pkceVerifier: string, requestUrl: string) {
  const env = await config()
  const response = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: env.pollinationsAppKey,
      redirect_uri: `${originFor(requestUrl)}/api/integrations/pollinations/callback`,
      code_verifier: pkceVerifier,
    }),
  })
  const payload = await response.json() as { access_token?: string; expires_in?: number; scope?: string }
  if (!response.ok || !payload.access_token) throw new Error('Pollinations token exchange failed')
  const scopes = new Set(String(payload.scope || '').split(/[\s,]+/))
  if (![...SCOPE.split(' ')].every(scope => scopes.has(scope))) throw new Error('Pollinations scopes are incomplete')
  return payload as { access_token: string; expires_in?: number; scope?: string }
}
