const ACCOUNTS_BASE = 'https://accounts.elixpo.com';
const CLIENT_SECRET = process.env.ELIXPO_CLIENT_SECRET || process.env.NEXT_PUBLIC_ELIXPO_CLIENT_SECRET || '';

export async function POST(request) {
  const body = await request.json();

  // Inject client_secret server-side — never exposed to the browser
  const payload = { ...body };
  if (body.grant_type === 'authorization_code' || body.grant_type === 'refresh_token') {
    payload.client_secret = CLIENT_SECRET;
  }

  console.log('[auth/token] Sending to accounts server:', {
    grant_type: payload.grant_type,
    client_id: payload.client_id,
    redirect_uri: payload.redirect_uri,
    has_code: !!payload.code,
    has_secret: !!payload.client_secret,
  });

  const res = await fetch(`${ACCOUNTS_BASE}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[auth/token] Error from accounts server:', res.status, data);
  }

  return Response.json(data, { status: res.status });
}
