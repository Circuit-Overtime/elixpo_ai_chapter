import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'crumb-web', connector: 'pollinations' },
    { headers: { 'cache-control': 'no-store' } },
  )
}
