// HMAC-SHA256 helpers for verifying inbound webhooks (edge-runtime safe).
// Matches accounts.elixpo's webhook signing: hex(HMAC-SHA256(body, secret)).

const encoder = new TextEncoder();

function hex(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

// Constant-time string compare (avoids signature timing oracles).
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacHex(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return hex(sig);
}

// Verify a hex HMAC-SHA256 signature over `payload`.
export async function verifyHmacHex(payload, signatureHex, secret) {
  if (!signatureHex || !secret) return false;
  const expected = await hmacHex(payload, secret);
  return timingSafeEqual(expected, signatureHex.trim().toLowerCase());
}
