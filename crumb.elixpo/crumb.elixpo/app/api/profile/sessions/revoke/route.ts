import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { bindings } from '@/lib/cloudflare'

function finish(requestUrl: string, result: string) {
  return NextResponse.redirect(new URL(`/profile/sessions?result=${result}`, requestUrl), 303)
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  if (request.headers.get('origin') !== requestUrl.origin) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
  }
  const user = await currentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/api/auth/login?return_to=%2Fprofile%2Fsessions', request.url), 303)
  }
  const form = await request.formData()
  const publicId = form.get('session')
  if (typeof publicId !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(publicId)) {
    return finish(request.url, 'invalid')
  }
  const cookieStore = await cookies()
  const currentToken = cookieStore.get('crumb_session')?.value || ''
  const row = await (await bindings()).DB.prepare(`
    SELECT id FROM sessions WHERE public_id = ? AND user_id = ?
  `).bind(publicId, user.id).first<{ id: string }>()
  if (!row) return finish(request.url, 'missing')
  await (await bindings()).DB.prepare(
    'DELETE FROM sessions WHERE public_id = ? AND user_id = ?',
  ).bind(publicId, user.id).run()
  if (row.id === currentToken) {
    cookieStore.delete('crumb_session')
    return NextResponse.redirect(new URL('/?session=revoked', request.url), 303)
  }
  return finish(request.url, 'revoked')
}
