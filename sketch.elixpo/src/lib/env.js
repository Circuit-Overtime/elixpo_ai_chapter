/**
 * Environment-aware URL configuration.
 * Detects localhost vs production and returns the appropriate URLs.
 */

const PROD_ORIGIN = 'https://sketch.elixpo.com'
const PROD_COLLAB = 'wss://sketch.elixpo.com'

export function isLocalhost() {
  if (typeof window === 'undefined') {
    // Server-side: check NODE_ENV
    return process.env.NODE_ENV !== 'production'
  }
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('192.168.') || host.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
}

export function getWorkerURL() {
  if (process.env.NEXT_PUBLIC_WORKER_URL) {
    return process.env.NEXT_PUBLIC_WORKER_URL
  }
  if (typeof window !== 'undefined') {
    if (!window.location.hostname.includes('sketch.elixpo.com')) {
      return window.location.origin
    }
  }
  return isLocalhost() ? 'http://localhost:3000' : PROD_ORIGIN
}

export function getCollabURL() {
  const configuredURL = process.env.NEXT_PUBLIC_ROOM_WS_URL || process.env.NEXT_PUBLIC_COLLAB_URL
  if (configuredURL) return configuredURL
  return isLocalhost() ? 'ws://localhost:8787' : PROD_COLLAB
}

export function getAppOrigin() {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return isLocalhost() ? 'http://localhost:3000' : PROD_ORIGIN
}

export const WORKER_URL = getWorkerURL()
export const COLLAB_URL = getCollabURL()
