import { getRequestContext } from '@cloudflare/next-on-pages'

/**
 * Get Cloudflare bindings (D1, KV) from the request context.
 * Works on Cloudflare Pages (production) and wrangler pages dev (local).
 */
export function getCloudflareBindings() {
  const { env } = getRequestContext()
  return {
    DB: env.DB,
    KV: env.KV,
    MCP_RELAY_URL: env.MCP_RELAY_URL,
    MCP_RELAY_SECRET: env.MCP_RELAY_SECRET,
  }
}

/**
 * Generate a random token string.
 */
export function generateToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (v) => chars[v % chars.length]).join('')
}
