const AUTHORIZE_URL = 'https://oauth.cloudinary.com/oauth2/auth';
const TOKEN_URL = 'https://oauth.cloudinary.com/oauth2/token';
const REVOKE_URL = 'https://oauth.cloudinary.com/oauth2/revoke';
const USERINFO_URL = 'https://oauth.cloudinary.com/userinfo';

// Match Cloudinary's official CLI scopes. `openid` makes the selected product
// environment identity available consistently across authorization-server versions.
export const CLOUDINARY_OAUTH_SCOPE = 'openid offline_access asset_management upload';

export function isValidCloudinaryCloudName(value) {
  return typeof value === 'string'
    && value.length <= 255
    && /^[a-z0-9][a-z0-9_-]*$/i.test(value);
}

function oauthConfig() {
  const clientId = process.env.CLOUDINARY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.CLOUDINARY_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret || /^ENC\[/.test(clientId) || /^ENC\[/.test(clientSecret)) {
    throw new Error('Cloudinary OAuth client credentials are not configured');
  }
  return { clientId, clientSecret };
}

function basicCredentials() {
  const { clientId, clientSecret } = oauthConfig();
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

export function cloudinaryOAuthRedirectUri(origin) {
  return `${origin}/api/integrations/cloudinary/callback`;
}

export function buildCloudinaryAuthorizationUrl({ origin, state }) {
  const { clientId } = oauthConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: cloudinaryOAuthRedirectUri(origin),
    scope: CLOUDINARY_OAUTH_SCOPE,
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
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
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!response.ok || !data?.access_token) {
    const reason = data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new Error(`Cloudinary token request failed: ${reason}`);
  }
  return data;
}

export function exchangeCloudinaryCode({ code, origin }) {
  return requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cloudinaryOAuthRedirectUri(origin),
  });
}

export function refreshCloudinaryTokens(refreshToken) {
  return requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

export async function revokeCloudinaryToken(token) {
  if (!token) return;
  const response = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: basicCredentials(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok) throw new Error(`Cloudinary token revocation failed (${response.status})`);
}

function decodeJwtPayload(token) {
  const payload = String(token || '').split('.')[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function cloudNameFromObject(value) {
  if (!value || typeof value !== 'object') return '';
  return value.cloud_name
    || value.cloudName
    // Cloudinary OAuth access tokens identify the selected product environment
    // using this namespaced claim (the same claim consumed by Cloudinary's CLI).
    || value.ext?.cloud_name
    || value.product_environment?.cloud_name
    || value.productEnvironment?.cloudName
    || '';
}

export async function resolveCloudinaryCloudName(tokenData, callbackUrl) {
  const callbackCloud = callbackUrl?.searchParams?.get('cloud_name')
    || callbackUrl?.searchParams?.get('cloudName');
  const direct = cloudNameFromObject(tokenData) || callbackCloud
    || cloudNameFromObject(decodeJwtPayload(tokenData?.access_token))
    || cloudNameFromObject(decodeJwtPayload(tokenData?.id_token));
  if (direct) return direct;

  // Some authorization-server versions return the selected product
  // environment only from OpenID userinfo, so retain this as a fallback.
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
  });
  if (response.ok) return cloudNameFromObject(await response.json());
  return '';
}

export function tokenExpiry(expiresIn, now = Math.floor(Date.now() / 1000)) {
  const seconds = Number(expiresIn);
  return now + (Number.isFinite(seconds) && seconds > 0 ? seconds : 300);
}
