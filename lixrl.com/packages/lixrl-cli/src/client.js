const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'api_error', requestId = null, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export class LixrlClient {
  constructor({ apiUrl, apiKey, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    this.apiUrl = new URL(apiUrl);
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(pathname, { method = 'GET', body, headers = {}, raw = false } = {}) {
    const target = new URL(pathname, this.apiUrl);
    if (target.origin !== this.apiUrl.origin || !target.pathname.startsWith('/api/')) {
      throw new ApiError('CLI requests are restricted to the configured Lixrl API origin.', { code: 'unsafe_api_target' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(target, {
        method,
        signal: controller.signal,
        headers: {
          accept: raw ? '*/*' : 'application/json',
          authorization: `Bearer ${this.apiKey}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new ApiError(error?.name === 'AbortError' ? 'The Lixrl request timed out.' : 'Could not reach the Lixrl API.', {
        code: error?.name === 'AbortError' ? 'request_timeout' : 'network_error',
      });
    } finally {
      clearTimeout(timeout);
    }
    if (raw && response.ok) return response;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(payload?.error || `Lixrl returned HTTP ${response.status}.`, {
        status: response.status,
        code: response.status === 401 ? 'login_required' : payload?.code || `http_${response.status}`,
        requestId: response.headers.get('x-request-id'),
        details: payload,
      });
    }
    return payload;
  }

  me() {
    return this.request('/api/auth/me');
  }
}
