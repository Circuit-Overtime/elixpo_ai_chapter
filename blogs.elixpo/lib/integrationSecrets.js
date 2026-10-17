const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(keyEnv = 'CLOUDINARY_CONNECTION_ENCRYPTION_KEY') {
  // Keep both names statically visible so the Edge bundler includes either
  // binding while preserving Cloudinary's existing encrypted rows.
  const secret = keyEnv === 'POLLINATIONS_CONNECTION_ENCRYPTION_KEY'
    ? process.env.POLLINATIONS_CONNECTION_ENCRYPTION_KEY
    : process.env.CLOUDINARY_CONNECTION_ENCRYPTION_KEY;
  if (!secret || /^ENC\[/.test(secret.trim())) {
    throw new Error(`${keyEnv} is not configured`);
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptIntegrationSecret(value, { keyEnv } = {}) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(keyEnv),
    encoder.encode(value),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptIntegrationSecret(value, { keyEnv } = {}) {
  const [version, ivValue, ciphertextValue] = String(value || '').split('.');
  if (version !== 'v1' || !ivValue || !ciphertextValue) throw new Error('Invalid encrypted integration secret');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(ivValue) },
    await encryptionKey(keyEnv),
    base64UrlToBytes(ciphertextValue),
  );
  return decoder.decode(decrypted);
}
