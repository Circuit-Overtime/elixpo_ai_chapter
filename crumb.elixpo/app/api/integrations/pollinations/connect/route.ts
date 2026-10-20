import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { bindings } from '@/lib/cloudflare'
import { randomToken } from '@/lib/encoding'
import { authorizeUrl, challenge, verifier } from '@/lib/pollinations'

export async function GET(request: Request) {
  const user = await currentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/api/auth/login?return_to=%2Fconnect', request.url))
  }
  const oauthState = randomToken()
  const pkceVerifier = verifier()
  await (await bindings()).KV.put(`pollinations:${oauthState}`, JSON.stringify({
    userId: user.id,
    verifier: pkceVerifier,
  }), { expirationTtl: 600 })
  return NextResponse.redirect(await authorizeUrl(oauthState, await challenge(pkceVerifier), request.url))
}
