import { cookies } from 'next/headers';

const SESSION_COOKIE = 'lixblogs_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 15; // 15 days
const encoder = new TextEncoder();

export function getOAuthConfig() {
  return {
    clientId: process.env.NEXT_PUBLIC_ELIXPO_CLIENT_ID,
    clientSecret: process.env.ELIXPO_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.elixpo.com/oauth/authorize',
    tokenUrl: 'https://accounts.elixpo.com/api/auth/token',
    userInfoUrl: 'https://accounts.elixpo.com/api/auth/me',
    redirectUri: null, // set dynamically per-request from the request URL
    scope: 'openid profile email',
  };
}

// ---- Signed-session helpers (HMAC-SHA256) ----
// Cookie format: base64url(payloadJSON) + "." + base64url(hmac)
// The HMAC is computed over the payload bytes with SESSION_SECRET, so a client
// cannot tamper with userId / tokens without invalidating the signature.

function bytesToB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getHmacKey(usages) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

// Sign a session object → cookie string. Returns null if no secret configured.
export async function signSession(payload) {
  const json = JSON.stringify(payload);
  const payloadBytes = encoder.encode(json);
  const key = await getHmacKey(['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  return `${bytesToB64url(payloadBytes)}.${bytesToB64url(sig)}`;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE;

export async function getSession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const dot = raw.indexOf('.');
  if (dot <= 0) return null; // unsigned/legacy cookie → reject

  try {
    const payloadBytes = b64urlToBytes(raw.slice(0, dot));
    const sigBytes = b64urlToBytes(raw.slice(dot + 1));
    const key = await getHmacKey(['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (session && Number.isFinite(session.expiresAt) && Date.now() > session.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
