const ELIXPO_AUTH_URL = 'https://accounts.elixpo.com'

export function readAuthCookie(request) {
  try {
    const raw = request.cookies.get('lixsketch-session')?.value
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return JSON.parse(decodeURIComponent(raw))
    }
  } catch {
    return null
  }
}

export function readAuthBearerToken(request) {
  try {
    const authorization = request.headers.get('authorization') || ''
    const match = authorization.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
  } catch {
    return null
  }
}

export async function getUserForAccessToken(sessionToken, savedUser = null) {
  if (!sessionToken) return null
  try {
    const response = await fetch(`${ELIXPO_AUTH_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
      cache: 'no-store',
    })
    if (!response.ok) return null
    const profile = await response.json()
    const id = profile.id || profile.userId
    if (!id) return null
    return {
      id,
      email: profile.email || savedUser?.email || null,
      displayName: profile.displayName || savedUser?.displayName || null,
      avatar: profile.avatar || savedUser?.avatar || null,
      isAdmin: profile.isAdmin || false,
      tier: profile.tier || savedUser?.tier || 'free',
    }
  } catch {
    return null
  }
}

export async function getAuthenticatedUser(request) {
  const saved = readAuthCookie(request)
  // Client-side routes keep the current access token in the auth store. Use
  // an explicitly supplied bearer token first so an absent or stale mirror
  // cookie cannot make an authenticated request appear signed out.
  const sessionToken = readAuthBearerToken(request) || saved?.sessionToken
  return getUserForAccessToken(sessionToken, saved?.user)
}
