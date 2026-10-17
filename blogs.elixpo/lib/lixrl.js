const DEFAULT_LIXRL_URL = 'https://lixrl.com';

function baseUrl() {
  return (process.env.LIXRL_URL || DEFAULT_LIXRL_URL).replace(/\/$/, '');
}

export async function callLixrl(action, user, payload = {}) {
  const token = process.env.LIXRL_SHORTNER_TOKEN;
  if (!token) throw new Error('LixRL integration is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${baseUrl()}/api/integrations/blogs`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name || user.username,
          avatar_url: user.avatar_url || null,
        },
        ...payload,
      }),
    });

    const data = await response.json().catch(() => ({ error: 'LixRL returned an invalid response' }));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}
