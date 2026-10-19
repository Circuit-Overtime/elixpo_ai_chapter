import { NextResponse } from 'next/server'
import { bindings, config } from '@/lib/cloudflare'

const REPLAY_WINDOW_SECONDS = 300

interface AccountsEvent {
  event?: string
  elixpo_id?: string
}

function unauthorized(reason: string) {
  console.warn(`[crumb/accounts-webhook] rejected: ${reason}`)
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function hex(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null
  return Uint8Array.from({ length: 32 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16))
}

async function validSignature(secret: string, message: string, header: string): Promise<boolean> {
  const signature = hex(header.startsWith('sha256=') ? header.slice(7) : header)
  if (!signature) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(message))
}

export async function POST(request: Request) {
  const secret = (await config()).accountsWebhookSecret
  if (!secret) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 })

  const timestamp = request.headers.get('x-elixpo-timestamp') || ''
  if (!/^\d+$/.test(timestamp)) return unauthorized('invalid timestamp')
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > REPLAY_WINDOW_SECONDS) {
    return unauthorized('expired timestamp')
  }

  const rawBody = await request.text()
  if (!await validSignature(secret, `${timestamp}.${rawBody}`, request.headers.get('x-elixpo-signature') || '')) {
    return unauthorized('invalid signature')
  }

  let body: AccountsEvent
  try {
    body = JSON.parse(rawBody) as AccountsEvent
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.event || !body.elixpo_id) {
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 })
  }

  const eventId = request.headers.get('x-elixpo-event-id')
  const dedupeKey = eventId ? `accounts-webhook:${eventId}` : null
  const env = await bindings()
  if (dedupeKey && await env.KV.get(dedupeKey)) {
    return NextResponse.json({ ok: true, deduped: true })
  }

  if (body.event === 'user.deleted') {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(body.elixpo_id).run()
  }
  if (dedupeKey) await env.KV.put(dedupeKey, '1', { expirationTtl: 1800 })
  return NextResponse.json({ ok: true, event: body.event })
}
