import { BlogApiError } from './BlogClient.js';

async function parseResponse(response) {
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.error) {
    throw new BlogApiError(
      payload?.error?.code || `http_${response.status}`,
      payload?.error?.message || `LixBlogs returned HTTP ${response.status}.`,
      { status: response.status, requestId: payload?.error?.requestId || response.headers.get('x-request-id'), details: payload?.error?.details },
    );
  }
  return payload;
}

export class AnalyticsClient {
  constructor(authenticatedClient) {
    this.http = authenticatedClient;
  }

  async query(options = {}) {
    const scope = options.scope || 'personal';
    await this.http.requireScopes([
      'lixblogs:analytics:read',
      ...(scope.startsWith('org:') ? ['lixblogs:organizations:read'] : []),
    ]);
    const query = new URLSearchParams({
      scope,
      range: options.range || (options.from || options.to ? 'custom' : '30d'),
      dimension: options.dimension || 'overview',
      limit: String(options.limit || 20),
    });
    if (options.from) query.set('from', options.from);
    if (options.to) query.set('to', options.to);
    if (options.cursor) query.set('cursor', options.cursor);
    return parseResponse(await this.http.request(`/api/v1/analytics?${query}`, {
      headers: { accept: 'application/json' },
    }));
  }
}
