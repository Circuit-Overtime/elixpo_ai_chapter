import { BlogApiError } from './BlogClient.js';

async function parseResponse(response) {
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.error) {
    throw new BlogApiError(
      payload?.error?.code || `http_${response.status}`,
      payload?.error?.message || `LixBlogs returned HTTP ${response.status}.`,
      { status: response.status, requestId: payload?.error?.requestId || response.headers.get('x-request-id') },
    );
  }
  return payload?.data;
}

export class CollectionClient {
  constructor(authenticatedClient) {
    this.http = authenticatedClient;
  }

  async request(path, options = {}) {
    const response = await this.http.request(path, {
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    return parseResponse(response);
  }

  async requireScopes(scopes) {
    if (typeof this.http.requireScopes === 'function') await this.http.requireScopes(scopes);
  }

  async list() {
    await this.requireScopes(['lixblogs:blog:read']);
    return this.request('/api/v1/collections');
  }

  async get(id) {
    await this.requireScopes(['lixblogs:blog:read']);
    return this.request(`/api/v1/collections/${encodeURIComponent(id)}`);
  }

  async create(input) {
    await this.requireScopes(['lixblogs:blog:write']);
    return this.request('/api/v1/collections', { method: 'POST', body: JSON.stringify(input) });
  }

  async update(id, input) {
    await this.requireScopes(['lixblogs:blog:write']);
    return this.request(`/api/v1/collections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  async delete(id) {
    await this.requireScopes(['lixblogs:blog:write']);
    return this.request(`/api/v1/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async entries(id) {
    await this.requireScopes(['lixblogs:blog:read']);
    return this.request(`/api/v1/collections/${encodeURIComponent(id)}/entries`);
  }

  async add(id, input) {
    await this.requireScopes(['lixblogs:blog:write']);
    return this.request(`/api/v1/collections/${encodeURIComponent(id)}/entries`, { method: 'POST', body: JSON.stringify(input) });
  }

  async remove(id, blogId) {
    await this.requireScopes(['lixblogs:blog:write']);
    return this.request(`/api/v1/collections/${encodeURIComponent(id)}/entries?blogId=${encodeURIComponent(blogId)}`, { method: 'DELETE' });
  }
}
