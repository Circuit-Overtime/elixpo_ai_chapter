import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (!LOCAL_HOSTS.has(url.hostname)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  ;(await cookies()).set('crumb_session', 'crumb-local-session', {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 15 * 86400,
  })
  return NextResponse.redirect(new URL('/profile/connectors', url), 303)
}
