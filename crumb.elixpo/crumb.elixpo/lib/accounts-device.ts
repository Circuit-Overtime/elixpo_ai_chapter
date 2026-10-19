import { config } from '@/lib/cloudflare'

export const DEVICE_SCOPES = ['openid', 'profile', 'email'] as const

interface DeviceClaims {
  aud?: string | string[]
  client_id?: string
  exp?: number
  iss?: string
  scopes?: string[]
  sub?: string
  type?: string
}

interface AccountsProfile {
  id?: string
  sub?: string
  email?: string
  displayName?: string
  scopes?: string[]
}

function decodeClaims(token: string): DeviceClaims | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as DeviceClaims
  } catch {
    return null
  }
}

export async function verifyDeviceToken(token: string): Promise<{ id: string; email: string }> {
  const env = await config()
  const claims = decodeClaims(token)
  const audiences = typeof claims?.aud === 'string' ? [claims.aud] : claims?.aud || []
  const scopes = claims?.scopes || []
  const validClaims = claims?.type === 'access'
    && claims.client_id === env.accountsCliClientId
    && claims.iss === env.accountsOrigin
    && audiences.includes(env.accountsCliAudience)
    && typeof claims.exp === 'number' && claims.exp > Date.now() / 1000
    && DEVICE_SCOPES.every(scope => scopes.includes(scope))
  if (!validClaims) throw new Error('Accounts device token claims are invalid')

  const response = await fetch(new URL('/api/auth/me', env.accountsOrigin), {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store',
  })
  const profile = await response.json().catch(() => null) as AccountsProfile | null
  const id = profile?.id || profile?.sub
  if (!response.ok || !id || id !== claims.sub || !profile?.email) {
    throw new Error('Accounts device token is invalid')
  }
  return { id, email: profile.email }
}
