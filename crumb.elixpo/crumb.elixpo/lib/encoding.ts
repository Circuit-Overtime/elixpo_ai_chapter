const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encode(value: Uint8Array<ArrayBuffer>): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}

export function text(value: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(value)
}

export function string(value: ArrayBuffer): string {
  return decoder.decode(value)
}

export function randomToken(bytes = 32): string {
  return encode(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function digest(value: string): Promise<string> {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', text(value))))
}
