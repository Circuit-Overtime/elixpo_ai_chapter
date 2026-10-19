import { NextResponse } from 'next/server'
import { accountsAuthorizeUrl, currentUser } from '@/lib/auth'
import { bindings } from '@/lib/cloudflare'
import { randomToken } from '@/lib/encoding'

function safeReturnTo(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export async function GET(request: Request) {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('return_to'))
  if (await currentUser()) return NextResponse.redirect(new URL(returnTo, request.url))
  const state = randomToken()
  await (await bindings()).KV.put(`accounts:${state}`, returnTo, { expirationTtl: 600 })
  return NextResponse.redirect(await accountsAuthorizeUrl(state, request.url))
}
