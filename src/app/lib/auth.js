const ACCOUNTS_BASE = 'https://accounts.elixpo.com';

const SESSION_DURATION = 15 * 24 * 60 * 60 * 1000; // 15 days

function getClientId() {
  return process.env.NEXT_PUBLIC_ELIXPO_CLIENT_ID || '';
}

function getRedirectUri() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/auth/callback`;
}

export function getSignInUrl() {
  const clientId = getClientId();
  const redirectUri = getRedirectUri();
  if (!clientId || !redirectUri) return '#';

  const state = crypto.randomUUID();
  sessionStorage.setItem('oauth_state', state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: 'openid profile email',
  });
  return `${ACCOUNTS_BASE}/oauth/authorize?${params}`;
}

export async function exchangeCode(code) {
  const res = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: getClientId(),
      redirect_uri: getRedirectUri(),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  return data;
}

export async function fetchUser(accessToken) {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

export async function refreshToken(token) {
  const res = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: token,
      client_id: getClientId(),
    }),
  });
  if (!res.ok) throw new Error('Refresh failed');
  return res.json();
}

// Persistence — 15-day session
export function saveAuth(tokens, user) {
  const data = { ...tokens, user, savedAt: Date.now() };
  localStorage.setItem('elixpo_auth', JSON.stringify(data));
}

export function getAuth() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('elixpo_auth');
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Expire after 15 days
    if (Date.now() - (data.savedAt || 0) > SESSION_DURATION) {
      clearAuth();
      return null;
    }
    return data;
  } catch { return null; }
}

export function clearAuth() {
  localStorage.removeItem('elixpo_auth');
}

export function isSignedIn() {
  return !!getAuth()?.access_token;
}

export function getUser() {
  return getAuth()?.user || null;
}

// Try to refresh if access token is expired (15 min), but session is still valid
export async function ensureAuth() {
  const auth = getAuth();
  if (!auth) return null;
  const tokenAge = Date.now() - (auth.savedAt || 0);
  // Access token expires in 15 min, try refresh
  if (tokenAge > 14 * 60 * 1000 && auth.refresh_token) {
    try {
      const newTokens = await refreshToken(auth.refresh_token);
      const user = await fetchUser(newTokens.access_token);
      saveAuth(newTokens, user);
      return { ...newTokens, user };
    } catch {
      return auth; // fallback to existing
    }
  }
  return auth;
}

// ─── Credit-based usage tracking ─────────────────────────────────

export function getUserTier() {
  const user = getUser();
  if (!user) return 'guest';
  return user.plan || user.plan_id || 'free';
}

// Fetch current credit balance
export async function fetchCredits() {
  try {
    const user = getUser();
    const tier = getUserTier();
    const params = new URLSearchParams({ tier });
    if (user?.id) params.set('userId', user.id);
    const res = await fetch(`/api/usage?${params}`);
    if (!res.ok) return null;
    return res.json(); // { credits, creditsUsed, dailyTotal, tier }
  } catch {
    return null;
  }
}

// Spend credits for an action. Returns { allowed, credits, cost, ... } or { allowed: false, error }
export async function spendCredits(action, model) {
  try {
    const user = getUser();
    const tier = getUserTier();
    const body = { action, model };
    if (user?.id) {
      body.userId = user.id;
      body.tier = tier;
    }

    const res = await fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { allowed: false, ...data };
    return { allowed: true, ...data };
  } catch {
    return { allowed: true, fallback: true };
  }
}

// Legacy compat — wraps spendCredits
export async function checkAndIncrement(type) {
  return spendCredits(type === 'videos' ? 'video' : type === 'images' ? 'image' : type);
}

export function getGuestSessionId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem('elixpo_guest_session');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('elixpo_guest_session', id);
  }
  return id;
}
