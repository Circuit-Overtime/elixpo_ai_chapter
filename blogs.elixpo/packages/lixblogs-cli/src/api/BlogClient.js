import { randomUUID } from 'node:crypto';

export class BlogApiError extends Error {
  constructor(code, message, { status, requestId, details } = {}) {
    super(message);
    this.name = 'BlogApiError';
    this.code = code || 'api_error';
    this.status = status || 0;
    this.requestId = requestId || null;
    this.details = details || null;
  }
}

async function parseResponse(response) {
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.error) {
    throw new BlogApiError(
      payload?.error?.code || `http_${response.status}`,
      payload?.error?.message || `LixBlogs returned HTTP ${response.status}.`,
      {
        status: response.status,
        requestId: payload?.error?.requestId || response.headers.get('x-request-id'),
        details: payload?.error?.details,
      },
    );
  }
  return { payload, etag: response.headers.get('etag') };
}

export class BlogClient {
  constructor(authenticatedClient, { sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) } = {}) {
    this.http = authenticatedClient;
    this.sleep = sleep;
  }

  async request(path, options = {}) {
    const requestOptions = {
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
    };
    const method = requestOptions.method || 'GET';
    const retryable = method === 'GET' || Boolean(requestOptions.headers['idempotency-key']);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.http.request(path, requestOptions);
        if (retryable && attempt === 0 && (response.status === 429 || response.status >= 500)) {
          const seconds = Math.min(2, Number.parseInt(response.headers.get('retry-after') || '1', 10) || 1);
          await this.sleep(seconds * 1000);
          continue;
        }
        return parseResponse(response);
      } catch (error) {
        if (!retryable || attempt > 0 || error instanceof BlogApiError || error?.code) throw error;
        await this.sleep(250);
      }
    }
    throw new BlogApiError('request_failed', 'The LixBlogs request failed after retrying.');
  }

  async requireScopes(scopes) {
    if (typeof this.http.requireScopes === 'function') await this.http.requireScopes(scopes);
  }

  async whoami() {
    await this.requireScopes(['lixblogs:profile:read']);
    return (await this.request('/api/v1/me')).payload.data;
  }

  async updateProfile(input) {
    await this.requireScopes(['lixblogs:profile:write']);
    return (await this.request('/api/v1/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })).payload.data;
  }

  async list({ status = 'all', limit = 20, cursor } = {}) {
    await this.requireScopes(['lixblogs:blog:read']);
    const query = new URLSearchParams({ status, limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    return (await this.request(`/api/v1/blogs?${query}`)).payload;
  }

  async get(id) {
    await this.requireScopes(['lixblogs:blog:read']);
    const result = await this.request(`/api/v1/blogs/${encodeURIComponent(id)}`);
    // Production CDNs may rewrite the HTTP ETag as a weak validator. The API's
    // JSON ETag is the authoritative strong validator required by If-Match.
    return { ...result.payload.data, etag: result.payload.data.etag || result.etag };
  }

  async create(input, { idempotencyKey = randomUUID() } = {}) {
    await this.requireScopes(['lixblogs:blog:write']);
    return (await this.request('/api/v1/blogs', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify(input),
    })).payload.data;
  }

  async update(id, input, { etag }) {
    await this.requireScopes(['lixblogs:blog:write']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'if-match': etag },
      body: JSON.stringify(input),
    })).payload.data;
  }

  async publish(id, { etag, status = 'published', idempotencyKey = randomUUID() }) {
    await this.requireScopes(['lixblogs:blog:publish']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      headers: { 'if-match': etag, 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ status }),
    })).payload.data;
  }

  async unpublish(id, { etag }) {
    await this.requireScopes(['lixblogs:blog:publish']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/unpublish`, {
      method: 'POST', headers: { 'if-match': etag },
    })).payload.data;
  }

  async delete(id, { etag, permanent = false }) {
    await this.requireScopes([
      'lixblogs:blog:delete',
      ...(permanent ? ['lixblogs:blog:delete:permanent'] : []),
    ]);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}${permanent ? '?permanent=true' : ''}`, {
      method: 'DELETE',
      headers: {
        'if-match': etag,
        ...(permanent ? { 'x-confirm-permanent-delete': id } : {}),
      },
    })).payload.data;
  }

  async restore(id, { etag }) {
    await this.requireScopes(['lixblogs:blog:delete']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/restore`, {
      method: 'POST', headers: { 'if-match': etag },
    })).payload.data;
  }

  async versions(id) {
    await this.requireScopes(['lixblogs:blog:read']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/versions`)).payload.data;
  }

  async version(id, versionId) {
    await this.requireScopes(['lixblogs:blog:read']);
    const query = new URLSearchParams({ version: versionId });
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/versions?${query}`)).payload.data;
  }

  async restoreVersion(id, versionId, { etag }) {
    await this.requireScopes(['lixblogs:blog:write']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/versions`, {
      method: 'POST', headers: { 'if-match': etag }, body: JSON.stringify({ versionId }),
    })).payload.data;
  }

  async comments(id) {
    await this.requireScopes(['lixblogs:blog:read']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/comments`)).payload.data;
  }

  async comment(id, content, { parentId } = {}) {
    await this.requireScopes(['lixblogs:blog:write']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/comments`, {
      method: 'POST', body: JSON.stringify({ content, parentId }),
    })).payload.data;
  }

  async deleteComment(id, commentId) {
    await this.requireScopes(['lixblogs:blog:write']);
    return (await this.request(`/api/v1/blogs/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' })).payload.data;
  }
}
