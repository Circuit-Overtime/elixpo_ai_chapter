import { randomUUID } from 'node:crypto';
import { BlogApiError } from './BlogClient.js';

async function parseResponse(response) {
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.error) {
    throw new BlogApiError(payload?.error?.code || `http_${response.status}`, payload?.error?.message || `LixBlogs returned HTTP ${response.status}.`, {
      status: response.status,
      requestId: payload?.error?.requestId || response.headers.get('x-request-id'),
      details: payload?.error?.details,
    });
  }
  return payload.data;
}

export class CollaborationClient {
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

  async list(blogId) {
    await this.http.requireScopes(['lixblogs:collaboration:read']);
    return this.request(`/api/v1/blogs/${encodeURIComponent(blogId)}/collaborators`);
  }

  async invitations() {
    await this.http.requireScopes(['lixblogs:collaboration:read']);
    return this.request('/api/v1/collaboration/invitations');
  }

  async invite(blogId, { user, role, idempotencyKey = randomUUID() }) {
    await this.http.requireScopes(['lixblogs:collaboration:write']);
    return this.request(`/api/v1/blogs/${encodeURIComponent(blogId)}/collaborators`, {
      method: 'POST', headers: { 'idempotency-key': idempotencyKey }, body: JSON.stringify({ user, role }),
    });
  }

  async role(blogId, { user, role, idempotencyKey = randomUUID() }) {
    await this.http.requireScopes(['lixblogs:collaboration:write']);
    return this.request(`/api/v1/blogs/${encodeURIComponent(blogId)}/collaborators`, {
      method: 'PATCH', headers: { 'idempotency-key': idempotencyKey }, body: JSON.stringify({ user, role }),
    });
  }

  async remove(blogId, { user, idempotencyKey = randomUUID() } = {}) {
    await this.http.requireScopes(['lixblogs:collaboration:write']);
    return this.request(`/api/v1/blogs/${encodeURIComponent(blogId)}/collaborators`, {
      method: 'DELETE', headers: { 'idempotency-key': idempotencyKey }, body: JSON.stringify({ ...(user ? { user } : {}) }),
    });
  }

  async resolveInvitation(blogId, { action, showOnProfile = true, idempotencyKey = randomUUID() }) {
    await this.http.requireScopes(['lixblogs:collaboration:write']);
    return this.request('/api/v1/collaboration/invitations', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ blogId, action, showOnProfile }),
    });
  }
}
