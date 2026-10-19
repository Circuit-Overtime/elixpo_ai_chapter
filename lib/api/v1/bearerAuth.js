const encoder = new TextEncoder();
let cachedPem = null;
let cachedKey = null;

export class ApiAuthError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.name = 'ApiAuthError';
    this.code = code;
    this.status = status;
  }
}

function base64urlBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodePart(value) {
  try {
    return JSON.parse(new TextDecoder().decode(base64urlBytes(value)));
  } catch {
    throw new ApiAuthError('invalid_token', 'The access token is malformed.');
  }
}

function pemToDer(pem) {
  const body = String(pem)
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  if (!body) throw new ApiAuthError('server_configuration_error', 'Bearer authentication is not configured.', 503);
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function verifyingKey(publicKeyPem) {
  if (cachedKey && cachedPem === publicKeyPem) return cachedKey;
  try {
    cachedKey = await crypto.subtle.importKey(
      'spki',
      pemToDer(publicKeyPem),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    cachedPem = publicKeyPem;
    return cachedKey;
  } catch (error) {
    if (error instanceof ApiAuthError) throw error;
    throw new ApiAuthError('server_configuration_error', 'Bearer authentication is not configured.', 503);
  }
}

function hasAudience(payloadAudience, expected) {
  return Array.isArray(payloadAudience)
    ? payloadAudience.includes(expected)
    : payloadAudience === expected;
}

export async function verifyAccessToken(token, options = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 16_384) {
    throw new ApiAuthError('invalid_token', 'The access token is malformed.');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiAuthError('invalid_token', 'The access token is malformed.');

  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (header.alg !== 'EdDSA') throw new ApiAuthError('invalid_token', 'The access token algorithm is not accepted.');

  const publicKeyPem = options.publicKeyPem || process.env.ACCOUNTS_JWT_PUBLIC_KEY || process.env.JWT_PUBLIC_KEY;
  const key = options.verifyingKey || await verifyingKey(publicKeyPem);
  const signatureValid = await crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    base64urlBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!signatureValid) throw new ApiAuthError('invalid_token', 'The access token signature is invalid.');

  const now = Math.floor(Date.now() / 1000);
  if (payload.type !== 'access' || !payload.sub || !Number.isFinite(payload.exp)) {
    throw new ApiAuthError('invalid_token', 'The access token claims are invalid.');
  }
  if (payload.exp <= now || (payload.nbf && payload.nbf > now + 30)) {
    throw new ApiAuthError('token_expired', 'The access token has expired.');
  }
  const audience = options.audience || process.env.LIXBLOGS_API_AUDIENCE || 'blogs.elixpo.com';
  if (!hasAudience(payload.aud, audience)) {
    throw new ApiAuthError('invalid_audience', 'The access token is not intended for LixBlogs.');
  }
  const allowedClients = options.allowedClients || String(
    process.env.LIXBLOGS_CLI_CLIENT_IDS || 'lixblogs-cli-prod',
  ).split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowedClients.includes(payload.client_id)) {
    throw new ApiAuthError('invalid_client', 'The access token was not issued to an approved LixBlogs client.');
  }

  return {
    userId: payload.sub,
    clientId: payload.client_id,
    sessionId: payload.sid || null,
    scopes: Array.isArray(payload.scopes) ? payload.scopes : [],
    expiresAt: payload.exp,
  };
}

export async function requireBearerAuth(request, requiredScopes = [], options = {}) {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new ApiAuthError('missing_token', 'A Bearer access token is required.');
  let auth;
  if (match[1].startsWith('lix_pat_')) {
    if (!options.db) throw new ApiAuthError('server_configuration_error', 'Personal access token authentication is not configured.', 503);
    const { verifyPersonalAccessToken } = await import('./personalAccessTokens.js');
    auth = await verifyPersonalAccessToken(options.db, match[1]);
  } else {
    auth = await verifyAccessToken(match[1], options);
  }
  const missingScopes = requiredScopes.filter((scope) => !auth.scopes.includes(scope));
  if (missingScopes.length) {
    throw new ApiAuthError('insufficient_scope', 'The access token does not grant this operation.', 403);
  }
  return auth;
}
