import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'

export async function GET() {
  const user = await currentUser()
  return NextResponse.json(user ? { user } : { user: null }, {
    status: user ? 200 : 401,
    headers: { 'cache-control': 'no-store' },
  })
}
