export async function generatePKCE() {
  const codeVerifier = generateRandomString(43);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  return { codeVerifier, codeChallenge, state };
}

function generateRandomString(length: number) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

async function generateCodeChallenge(codeVerifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  // Base64URLEncode
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function exchangeOAuthCode(
  code: string,
  codeVerifier: string,
  env: { ELIXPO_CLIENT_ID: string; ELIXPO_CLIENT_SECRET: string; NEXT_PUBLIC_ELIXPO_SSO_URL: string; NEXT_PUBLIC_APP_URL: string }
) {
  const tokenUrl = `${env.NEXT_PUBLIC_ELIXPO_SSO_URL}/api/auth/token`;

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('client_id', env.ELIXPO_CLIENT_ID);
  params.append('client_secret', env.ELIXPO_CLIENT_SECRET);
  params.append('code', code);
  params.append('redirect_uri', `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback`);
  params.append('code_verifier', codeVerifier);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Failed to exchange code: ${await res.text()}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: {
      id: string;
      email: string;
      name: string;
      avatar?: string;
    };
  }>;
}
