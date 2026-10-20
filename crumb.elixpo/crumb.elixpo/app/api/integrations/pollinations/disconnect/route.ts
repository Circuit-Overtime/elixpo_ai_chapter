import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { bindings } from '@/lib/cloudflare'

function finish(requestUrl: string, result: string) {
  return NextResponse.redirect(new URL(`/profile/connectors?pollinations=${result}`, requestUrl), 303)
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  if (request.headers.get('origin') !== requestUrl.origin) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
  }
  const user = await currentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/api/auth/login?return_to=%2Fprofile%2Fconnectors', request.url), 303)
  }
  try {
    await (await bindings()).DB.prepare(
      'DELETE FROM pollinations_connections WHERE user_id = ?',
    ).bind(user.id).run()
    return finish(request.url, 'disconnected')
  } catch (error) {
    const reference = crypto.randomUUID().slice(0, 8)
    console.error(`[crumb/pollinations] disconnect failed ref=${reference}`, error instanceof Error ? error.message : 'unknown error')
    return finish(request.url, 'disconnect_failed')
  }
}
