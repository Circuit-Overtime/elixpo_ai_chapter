import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import nextEnv from '@next/env'
import { fileURLToPath } from 'node:url'

const { loadEnvConfig } = nextEnv
loadEnvConfig(fileURLToPath(new URL('..', import.meta.url)), process.env.NODE_ENV !== 'production', console, true)

initOpenNextCloudflareForDev()

const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https://accounts.elixpo.com; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
]

/** @type {import('next').NextConfig} */
export default {
  experimental: {},
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}
