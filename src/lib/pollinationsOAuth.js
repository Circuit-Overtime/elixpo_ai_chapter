const DISCOVERY_URL = 'https://enter.pollinations.ai/.well-known/oauth-authorization-server'
const DEFAULT_AUTHORIZE_URL = 'https://enter.pollinations.ai/authorize'
const DEFAULT_TOKEN_URL = 'https://enter.pollinations.ai/api/oauth/token'
const USERINFO_URL = 'https://enter.pollinations.ai/api/oauth/userinfo'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const POLLINATIONS_MODELS = Object.freeze(['flux', 'klein'])
export const POLLINATIONS_SCOPE = 'profile usage'

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

function appKey() {
  const value = process.env.POLLINATIONS_APP_KEY
  if (!value || !value.startsWith('pk_') || /^ENC\[/.test(value)) {
    throw new Error('POLLINATIONS_APP_KEY must be a Pollinations publishable App Key')
  }
  return value
}

async function contextKey() {
  const value = process.env.POLLINATIONS_CONNECTION_ENCRYPTION_KEY
  if (!value || /^ENC\[/.test(value)) throw new Error('Pollinations connection encryption is not configured')
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export function pollinationsRedirectUri(origin) {
  return `${origin}/api/integrations/pollinations/callback`
}

export function createPkceVerifier() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(48)))
}

export async function createPkceChallenge(verifier) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))
}

async function oauthEndpoints() {
  try {
    const response = await fetch(DISCOVERY_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    const discovery = await response.json()
    if (response.ok && discovery.authorization_endpoint && discovery.token_endpoint) {
      return { authorize: discovery.authorization_endpoint, token: discovery.token_endpoint }
    }
  } catch {}
  return { authorize: DEFAULT_AUTHORIZE_URL, token: DEFAULT_TOKEN_URL }
}

export async function buildPollinationsAuthorizationUrl({ origin, state, challenge }) {
  const { authorize } = await oauthEndpoints()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey(),
    redirect_uri: pollinationsRedirectUri(origin),
    scope: POLLINATIONS_SCOPE,
    models: POLLINATIONS_MODELS.join(','),
    expiry: '30',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `${authorize}?${params}`
}

export async function exchangePollinationsCode({ code, verifier, origin }) {
  const { token } = await oauthEndpoints()
  const response = await fetch(token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: appKey(),
      redirect_uri: pollinationsRedirectUri(origin),
      code_verifier: verifier,
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || `Pollinations OAuth failed (${response.status})`)
  }
  return data
}

export async function getPollinationsUserInfo(accessToken) {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) return null
  return response.json().catch(() => null)
}

export async function sealPollinationsOAuthContext({ user, state, verifier }, now = Math.floor(Date.now() / 1000)) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const payload = encoder.encode(JSON.stringify({
    user: { id: user.id, email: user.email || null, displayName: user.displayName || null },
    state,
    verifier,
    expiresAt: now + 600,
  }))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode('lixsketch:pollinations:oauth:v1') },
    await contextKey(),
    payload,
  )
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`
}

export async function openPollinationsOAuthContext(value, expectedState, now = Math.floor(Date.now() / 1000)) {
  const [version, ivValue, ciphertextValue] = String(value || '').split('.')
  if (version !== 'v1' || !ivValue || !ciphertextValue) return null
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64UrlToBytes(ivValue),
        additionalData: encoder.encode('lixsketch:pollinations:oauth:v1'),
      },
      await contextKey(),
      base64UrlToBytes(ciphertextValue),
    )
    const context = JSON.parse(decoder.decode(plaintext))
    if (!context?.user?.id || !context.verifier || context.state !== expectedState || context.expiresAt < now) return null
    return context
  } catch {
    return null
  }
}

export function pollinationsTokenExpiry(expiresIn, now = Math.floor(Date.now() / 1000)) {
  const seconds = Number(expiresIn)
  return now + (Number.isFinite(seconds) && seconds > 0 ? seconds : 7 * 86400)
}
