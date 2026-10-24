export class IntegrationsClient {
  constructor(authenticatedClient) {
    this.http = authenticatedClient;
  }

  async requireScopes(scopes) {
    if (typeof this.http.requireScopes === 'function') await this.http.requireScopes(scopes);
  }

  async _request(path, options = {}) {
    const response = await this.http.request(path, options);
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || payload?.error) {
      const error = new Error(payload?.error?.message || `Request failed with HTTP ${response.status}`);
      error.code = payload?.error?.code || `http_${response.status}`;
      error.status = response.status;
      error.requestId = payload?.error?.requestId || response.headers.get('x-request-id') || null;
      error.details = payload?.error?.details || null;
      throw error;
    }
    return payload.data;
  }

  async cloudinaryStatus() {
    await this.requireScopes(['lixblogs:integrations:cloudinary:read']);
    return this._request('/api/v1/integrations/cloudinary');
  }

  async cloudinaryDisconnect() {
    await this.requireScopes(['lixblogs:integrations:cloudinary:disconnect']);
    return this._request('/api/v1/integrations/cloudinary', { method: 'DELETE' });
  }

  async pollinationsStatus({ refresh = false } = {}) {
    await this.requireScopes(['lixblogs:media:read']);
    return this._request(`/api/v1/integrations/pollinations${refresh ? '?refresh=1' : ''}`);
  }

  async pollinationsDisconnect() {
    await this.requireScopes(['lixblogs:media:write']);
    return this._request('/api/v1/integrations/pollinations', { method: 'DELETE' });
  }
}
