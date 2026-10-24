import { NextResponse } from 'next/server'
import { DEVICE_SCOPES } from '@/lib/accounts-device'
import { config } from '@/lib/cloudflare'

export async function GET() {
  const env = await config()
  if (!env.accountsCliClientId) {
    return NextResponse.json({ error: 'device_flow_not_configured' }, { status: 503 })
  }
  return NextResponse.json({
    accounts_origin: env.accountsOrigin,
    client_id: env.accountsCliClientId,
    audience: env.accountsCliAudience,
    scopes: DEVICE_SCOPES,
  }, { headers: { 'cache-control': 'no-store' } })
}
