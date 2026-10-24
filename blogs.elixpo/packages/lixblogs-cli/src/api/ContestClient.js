import { BlogApiError } from './BlogClient.js';

async function parseResponse(response) {
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.error) throw new BlogApiError(
    payload?.error?.code || `http_${response.status}`,
    payload?.error?.message || `LixBlogs returned HTTP ${response.status}.`,
    { status: response.status, requestId: payload?.error?.requestId || response.headers.get('x-request-id') },
  );
  return payload?.data;
}

export class ContestClient {
  constructor(authenticatedClient) { this.http = authenticatedClient; }
  async request(path, options = {}) {
    const response = await this.http.request(path, { ...options, headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
    return parseResponse(response);
  }
  async requireScopes(scopes) { if (typeof this.http.requireScopes === 'function') await this.http.requireScopes(scopes); }
  async list({ status, mine = false } = {}) {
    await this.requireScopes(['lixblogs:blog:read']);
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (mine) query.set('mine', 'true');
    const search = query.toString();
    return this.request(`/api/v1/contests${search ? `?${search}` : ''}`);
  }
  async get(id) { await this.requireScopes(['lixblogs:blog:read']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}`); }
  async create(input) { await this.requireScopes(['lixblogs:blog:write']); return this.request('/api/v1/contests', { method: 'POST', body: JSON.stringify(input) }); }
  async update(id, input) { await this.requireScopes(['lixblogs:blog:write']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }); }
  async delete(id) { await this.requireScopes(['lixblogs:blog:delete']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  async submissions(id, { snapshot = false } = {}) { await this.requireScopes(['lixblogs:blog:read']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}/submissions${snapshot ? '?snapshot=true' : ''}`); }
  async submit(id, blogId) { await this.requireScopes(['lixblogs:blog:write']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}/submissions`, { method: 'POST', body: JSON.stringify({ blogId }) }); }
  async withdraw(id, submissionId) { await this.requireScopes(['lixblogs:blog:write']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}/submissions?submissionId=${encodeURIComponent(submissionId)}`, { method: 'DELETE' }); }
  async members(id) { await this.requireScopes(['lixblogs:blog:read']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}/members`); }
  async assign(id, user, role) { await this.requireScopes(['lixblogs:blog:write']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}/members`, { method: 'POST', body: JSON.stringify({ user, role }) }); }
  async removeMember(id, userId) { await this.requireScopes(['lixblogs:blog:write']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}/members?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }); }
  async results(id, awards, finalize) { await this.requireScopes(['lixblogs:blog:publish']); return this.request(`/api/v1/contests/${encodeURIComponent(id)}/results`, { method: 'POST', body: JSON.stringify({ awards, finalize }) }); }
}
