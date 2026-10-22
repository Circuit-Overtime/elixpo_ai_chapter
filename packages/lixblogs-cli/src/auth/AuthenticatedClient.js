import { AuthProviderError } from "./ElixpoAuthProvider.js";

const DEFAULT_REFRESH_SKEW_MS = 60_000;
const storeLocks = new WeakMap();

function profileLocks(credentialStore) {
  let locks = storeLocks.get(credentialStore);
  if (!locks) {
    locks = new Map();
    storeLocks.set(credentialStore, locks);
  }
  return locks;
}

export class LoginRequiredError extends Error {
  constructor(profileId) {
    super(`Profile "${profileId}" needs to log in again.`);
    this.name = "LoginRequiredError";
    this.code = "login_required";
  }
}

export class ApiContractUnavailableError extends Error {
  constructor(status, contentType) {
    super("The configured LixBlogs origin is not serving the API v1 JSON contract.");
    this.name = "ApiContractUnavailableError";
    this.code = "api_contract_unavailable";
    this.status = status;
    this.details = { contentType: contentType || "unknown" };
    this.hint = "Deploy the LixBlogs API v1 stack, or select an origin that exposes /api/v1.";
  }
}

export class AuthenticatedClient {
  constructor({
    provider,
    credentialStore,
    profileId,
    apiBaseUrl = "https://blogs.elixpo.com",
    fetchImpl = globalThis.fetch,
    refreshSkewMs = DEFAULT_REFRESH_SKEW_MS,
    accessToken = null,
  }) {
    this.provider = provider;
    this.credentialStore = credentialStore;
    this.profileId = profileId;
    this.apiBaseUrl = new URL(apiBaseUrl);
    this.fetchImpl = fetchImpl;
    this.refreshSkewMs = refreshSkewMs;
    this.accessToken = accessToken;
  }

  async _refresh(credentials, { force = false } = {}) {
    const locks = profileLocks(this.credentialStore);
    const existing = locks.get(this.profileId);
    if (existing) return existing;

    const operation = (async () => {
      const latest = (await this.credentialStore.get(this.profileId)) || credentials;
      if (!force && latest.expiresAt - Date.now() > this.refreshSkewMs) return latest;
      try {
        const token = await this.provider.refresh({
          refreshToken: latest.refreshToken,
          scopes: latest.scopes,
        });
        const rotated = {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: Date.now() + token.expiresInSeconds * 1000,
          scopes: token.scopes,
        };
        await this.credentialStore.set(this.profileId, rotated);
        return rotated;
      } catch (error) {
        if (error instanceof AuthProviderError && error.requiresLogin) {
          await this.credentialStore.delete(this.profileId);
          throw new LoginRequiredError(this.profileId);
        }
        throw error;
      }
    })();

    locks.set(this.profileId, operation);
    try {
      return await operation;
    } finally {
      if (locks.get(this.profileId) === operation) locks.delete(this.profileId);
    }
  }

  async credentials({ forceRefresh = false } = {}) {
    if (this.accessToken) {
      return {
        accessToken: this.accessToken,
        refreshToken: null,
        expiresAt: null,
        scopes: null,
        credentialType: "personal_access_token",
      };
    }
    const stored = await this.credentialStore.get(this.profileId);
    if (!stored) throw new LoginRequiredError(this.profileId);
    if (forceRefresh || stored.expiresAt - Date.now() <= this.refreshSkewMs) {
      return this._refresh(stored, { force: forceRefresh });
    }
    return stored;
  }

  async request(url, options = {}) {
    const response = await this.requestRaw(url, options);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new ApiContractUnavailableError(response.status, contentType);
    }
    return response;
  }

  async requestRaw(url, options = {}) {
    const target = new URL(url, this.apiBaseUrl);
    if (target.origin !== this.apiBaseUrl.origin || !target.pathname.startsWith("/api/v1/")) {
      throw new Error("Authenticated CLI requests are restricted to the configured LixBlogs /api/v1 resource server.");
    }
    let credentials = await this.credentials();
    const send = () => this.fetchImpl(target.toString(), {
      ...options,
      headers: { ...options.headers, authorization: `Bearer ${credentials.accessToken}` },
    });
    let response = await send();
    if (response.status === 401 && !this.accessToken) {
      credentials = await this.credentials({ forceRefresh: true });
      response = await send();
    }
    return response;
  }

  async requireScopes(required) {
    const credentials = await this.credentials();
    // PAT scopes are intentionally not duplicated into local configuration.
    // The resource server remains authoritative and returns insufficient_scope.
    if (!Array.isArray(credentials.scopes)) return;
    const missing = required.filter((scope) => !credentials.scopes.includes(scope));
    if (missing.length) {
      const error = new Error(`Login again with the required scope${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
      error.name = 'InsufficientScopeError';
      error.code = 'insufficient_scope';
      error.missingScopes = missing;
      throw error;
    }
  }
}
