const AUTHORIZE_URL = 'https://oauth.cloudinary.com/oauth2/auth'
const TOKEN_URL = 'https://oauth.cloudinary.com/oauth2/token'
const REVOKE_URL = 'https://oauth.cloudinary.com/oauth2/revoke'
const USERINFO_URL = 'https://oauth.cloudinary.com/userinfo'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const CLOUDINARY_OAUTH_SCOPE = 'openid offline_access asset_management upload'

function oauthConfig() {
  const clientId = process.env.CLOUDINARY_OAUTH_CLIENT_ID
  const clientSecret = process.env.CLOUDINARY_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret || /^ENC\[/.test(clientId) || /^ENC\[/.test(clientSecret)) {
    throw new Error('Cloudinary OAuth client credentials are not configured')
  }
  return { clientId, clientSecret }
}

function basicCredentials() {
  const { clientId, clientSecret } = oauthConfig()
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`
}

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function oauthContextKey() {
  const { clientSecret } = oauthConfig()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(clientSecret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function sealCloudinaryOAuthUser(user, state, now = Math.floor(Date.now() / 1000)) {
  if (!user?.id || !state) throw new Error('Cannot bind Cloudinary OAuth without a user and state')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const payload = JSON.stringify({
    id: user.id,
    email: user.email || null,
    displayName: user.displayName || null,
    state,
    expiresAt: now + 600,
  })
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode('lixsketch:cloudinary:oauth-user:v1') },
    await oauthContextKey(),
    encoder.encode(payload),
  )
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`
}

export async function openCloudinaryOAuthUser(value, expectedState, now = Math.floor(Date.now() / 1000)) {
  const [version, ivValue, ciphertextValue] = String(value || '').split('.')
  if (version !== 'v1' || !ivValue || !ciphertextValue) return null
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64UrlToBytes(ivValue),
        additionalData: encoder.encode('lixsketch:cloudinary:oauth-user:v1'),
      },
      await oauthContextKey(),
      base64UrlToBytes(ciphertextValue),
    )
    const user = JSON.parse(decoder.decode(plaintext))
    if (!user?.id || !expectedState || user.state !== expectedState || Number(user.expiresAt || 0) < now) return null
    return { id: user.id, email: user.email || null, displayName: user.displayName || null }
  } catch {
    return null
  }
}

export function cloudinaryOAuthRedirectUri(origin) {
  return `${origin}/api/integrations/cloudinary/callback`
}

export function buildCloudinaryAuthorizationUrl({ origin, state }) {
  const { clientId } = oauthConfig()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: cloudinaryOAuthRedirectUri(origin),
    scope: CLOUDINARY_OAUTH_SCOPE,
    state,
  })
  return `${AUTHORIZE_URL}?${params}`
}

async function requestTokens(params) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicCredentials(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || `Cloudinary OAuth failed (${response.status})`)
  }
  return data
}

export function exchangeCloudinaryCode({ code, origin }) {
  return requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cloudinaryOAuthRedirectUri(origin),
  })
}

export function refreshCloudinaryTokens(refreshToken) {
  return requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken })
}

export async function revokeCloudinaryToken(token) {
  if (!token) return
  const response = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: basicCredentials(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ token }),
  })
  if (!response.ok) throw new Error(`Cloudinary token revocation failed (${response.status})`)
}

function decodeJwtPayload(token) {
  const payload = String(token || '').split('.')[1]
  if (!payload) return null
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function cloudNameFromResource(value) {
  if (typeof value !== 'string') return ''
  const cloudinaryUrl = value.match(/^cloudinary:\/\/[^@]+@([^/?#]+)/i)
  if (cloudinaryUrl?.[1]) return cloudinaryUrl[1]
  const apiUrl = value.match(/\/v1_1\/([^/?#]+)/i)
  if (apiUrl?.[1]) return apiUrl[1]
  const deliveryUrl = value.match(/res\.cloudinary\.com\/([^/?#]+)/i)
  if (deliveryUrl?.[1]) return deliveryUrl[1]
  return isValidCloudinaryCloudName(value) ? value : ''
}

function cloudNameFromAudience(value) {
  if (Array.isArray(value)) {
    for (const audience of value) {
      const cloudName = cloudNameFromAudience(audience)
      if (cloudName) return cloudName
    }
    return ''
  }
  return cloudNameFromResource(value)
}

function parseEmbeddedObject(value) {
  if (typeof value !== 'string' || !/^[{[]/.test(value.trim())) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function extractCloudinaryCloudName(value, depth = 0, seen = new Set()) {
  if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return ''
  seen.add(value)

  for (const [key, rawValue] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    const isCloudNameKey = normalizedKey === 'cloudname'
      || normalizedKey.endsWith('cloudname')
      || normalizedKey === 'productenvironment'
      || normalizedKey === 'productenvironmentname'
      || normalizedKey === 'cloud'
    if (isCloudNameKey && typeof rawValue === 'string' && isValidCloudinaryCloudName(rawValue)) {
      return rawValue
    }
    if (['resource', 'resourceuri', 'apiurl', 'uploadurl'].includes(normalizedKey)) {
      const fromResource = cloudNameFromResource(rawValue)
      if (fromResource) return fromResource
    }
    if (normalizedKey === 'aud' || normalizedKey === 'audience') {
      const fromAudience = cloudNameFromAudience(rawValue)
      if (fromAudience) return fromAudience
    }

    const nestedValue = parseEmbeddedObject(rawValue) || rawValue
    const nested = extractCloudinaryCloudName(nestedValue, depth + 1, seen)
    if (nested) return nested
  }
  return ''
}

export async function resolveCloudinaryCloudName(tokens, callbackUrl) {
  const callbackIdentity = Object.fromEntries(callbackUrl.searchParams.entries())
  const direct = extractCloudinaryCloudName(tokens)
    || extractCloudinaryCloudName(callbackIdentity)
    || extractCloudinaryCloudName(decodeJwtPayload(tokens.access_token))
    || extractCloudinaryCloudName(decodeJwtPayload(tokens.id_token))
  if (direct) return direct
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
  })
  if (!response.ok) return ''
  const body = await response.text()
  let userInfo
  try {
    userInfo = JSON.parse(body)
  } catch {
    userInfo = decodeJwtPayload(body)
  }
  return extractCloudinaryCloudName(userInfo)
}

export function describeCloudinaryOAuthShape(tokens, callbackUrl) {
  const describeFields = (value, prefix = '', depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 3) return []
    const entries = Object.entries(value)
    if (!entries.length) return prefix ? [`${prefix}:empty-object`] : []
    return entries.flatMap(([key, nestedValue]) => {
      const path = prefix ? `${prefix}.${key}` : key
      if (nestedValue === null) return [`${path}:null`]
      if (Array.isArray(nestedValue)) {
        return [`${path}:array`, ...describeFields(nestedValue, path, depth + 1)]
      }
      if (typeof nestedValue === 'object') {
        return [`${path}:object`, ...describeFields(nestedValue, path, depth + 1)]
      }
      return [`${path}:${typeof nestedValue}`]
    })
  }
  const accessTokenClaims = decodeJwtPayload(tokens?.access_token) || {}
  const idTokenClaims = decodeJwtPayload(tokens?.id_token) || {}
  return {
    tokenFields: Object.keys(tokens || {}).sort(),
    callbackFields: [...callbackUrl.searchParams.keys()].sort(),
    accessTokenClaimShape: describeFields(accessTokenClaims).sort(),
    idTokenClaimShape: describeFields(idTokenClaims).sort(),
  }
}

export function isValidCloudinaryCloudName(value) {
  return typeof value === 'string' && value.length <= 128 && /^[a-z][a-z0-9_-]*$/i.test(value)
}

export function tokenExpiry(expiresIn, now = Math.floor(Date.now() / 1000)) {
  const seconds = Number(expiresIn)
  return now + (Number.isFinite(seconds) && seconds > 0 ? seconds : 300)
}
