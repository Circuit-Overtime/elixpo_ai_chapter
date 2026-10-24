import { config } from '@/lib/cloudflare'
import { decode, encode, string, text } from '@/lib/encoding'

async function key(): Promise<CryptoKey> {
  const secret = (await config()).connectorEncryptionKey
  if (!secret) throw new Error('Connector encryption is not configured')
  const digest = await crypto.subtle.digest('SHA-256', text(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptToken(token: string, userId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: text(`crumb:pollinations:${userId}:v1`) },
    await key(),
    text(token),
  )
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`
}

export async function decryptToken(value: string, userId: string): Promise<string> {
  const [version, iv, ciphertext] = value.split('.')
  if (version !== 'v1' || !iv || !ciphertext) throw new Error('Stored connector is invalid')
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(iv), additionalData: text(`crumb:pollinations:${userId}:v1`) },
    await key(),
    decode(ciphertext),
  )
  return string(plaintext)
}
