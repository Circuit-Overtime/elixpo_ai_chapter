const ACCOUNTS_BASE = 'https://accounts.elixpo.com';

export async function GET(request) {
  const authHeader = request.headers.get('Authorization');

  const res = await fetch(`${ACCOUNTS_BASE}/api/auth/me`, {
    headers: { Authorization: authHeader || '' },
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
