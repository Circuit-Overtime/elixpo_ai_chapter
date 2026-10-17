/**
 * Elixpo Accounts OAuth 2.0 helpers.
 * Based on: https://accounts.elixpo.com
 */

const ACCOUNTS_BASE = process.env.NEXT_PUBLIC_ELIXPO_ACCOUNTS_BASE_URL || "https://accounts.elixpo.com";
const CLIENT_ID = process.env.NEXT_PUBLIC_ELIXPO_ACCOUNTS_CLIENT_ID || "";
// Server-only — never expose to browser (no NEXT_PUBLIC_ prefix)
const CLIENT_SECRET = process.env.ELIXPO_OAUTH_CLIENT_SECRET || "";

export function getRedirectUri(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}/api/auth/callback`;
}

/** Step 1: Build the authorization URL */
export function getAuthorizationUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: "openid profile email",
  });
  return `${ACCOUNTS_BASE}/oauth/authorize?${params}`;
}

/** Step 3: Exchange authorization code for tokens */
export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch(`${ACCOUNTS_BASE}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const err: unknown = await res.json().catch(() => ({}));

    const errorMessage =
      typeof err === "object" &&
      err !== null &&
      "error" in err &&
      typeof err.error === "string"
        ? err.error
        : `Token exchange failed: ${res.status}`;

throw new Error(errorMessage);
  }

  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
  }>;
}

/** Step 4: Get user info from access token */
export async function getUserInfo(accessToken: string) {
  const res = await fetch(`${ACCOUNTS_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;

  return res.json() as Promise<{
    id: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
    provider: string;
    emailVerified: boolean;
  }>;
}

/** Step 5: Refresh tokens */
export async function refreshTokens(refreshToken: string) {
  const res = await fetch(`${ACCOUNTS_BASE}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!res.ok) return null;

  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
  }>;
}

/** Cookie helpers */
const COOKIE_NAME = "elixpo_session";

const FIFTEEN_DAYS = 15 * 24 * 60 * 60; // 1,296,000 seconds

export function setSessionCookie(accessToken: string, refreshToken: string, _expiresIn?: number) {
  const value = JSON.stringify({ accessToken, refreshToken });
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${FIFTEEN_DAYS}`;
}

export function parseSessionCookie(cookieHeader: string | null): { accessToken: string; refreshToken: string } | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(";").find((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
  } catch {
    return null;
  }
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
