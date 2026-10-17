const encoder = new TextEncoder()
const decoder = new TextDecoder()

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

async function encryptionKey(provider) {
  // A dedicated random secret is strongly preferred in production. The
  // client-id fallback supports the requested local setup without exposing
  // tokens to client code, but should not be treated as production-grade.
  const secret = provider === 'pollinations'
    ? process.env.POLLINATIONS_CONNECTION_ENCRYPTION_KEY
    : process.env.CLOUDINARY_CONNECTION_ENCRYPTION_KEY || process.env.CLOUDINARY_OAUTH_CLIENT_ID
  if (!secret || /^ENC\[/.test(secret.trim())) {
    throw new Error(`${provider === 'pollinations' ? 'Pollinations' : 'Cloudinary'} connection encryption is not configured`)
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptIntegrationSecret(value, userId, provider = 'cloudinary') {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const additionalData = encoder.encode(`lixsketch:${provider}:${userId}`)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    await encryptionKey(provider),
    encoder.encode(value),
  )
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`
}

export async function decryptIntegrationSecret(value, userId, provider = 'cloudinary') {
  const [version, ivValue, ciphertextValue] = String(value || '').split('.')
  if (version !== 'v1' || !ivValue || !ciphertextValue) throw new Error('Invalid encrypted integration secret')
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(ivValue),
      additionalData: encoder.encode(`lixsketch:${provider}:${userId}`),
    },
    await encryptionKey(provider),
    base64UrlToBytes(ciphertextValue),
  )
  return decoder.decode(decrypted)
}
