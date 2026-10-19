import { AuthProvider } from "./AuthProvider.js";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const SUPPORTED_CONTRACT_MAJOR = 1;
const DEFAULT_TIMEOUT_MS = 15_000;

const SAFE_ERROR_MESSAGES = {
  access_denied: "Login was denied.",
  authorization_pending: "Login is awaiting approval.",
  expired_token: "The device authorization expired. Start login again.",
  invalid_client: "The LixBlogs CLI client is not registered for this environment.",
  invalid_grant: "This session is no longer valid. Log in again.",
  invalid_request: "Accounts rejected the authentication request.",
  invalid_scope: "The requested LixBlogs permissions are not available for this client.",
  server_error: "Accounts could not complete authentication. Try again later.",
  slow_down: "Accounts requested slower polling.",
  temporarily_unavailable: "Accounts is temporarily unavailable. Try again later.",
};

export class AuthProviderError extends Error {
  constructor(code, { status = 0, requiresLogin = false } = {}) {
    super(SAFE_ERROR_MESSAGES[code] || "Authentication failed.");
    this.name = "AuthProviderError";
    this.code = code || "authentication_failed";
    this.status = status;
    this.requiresLogin = requiresLogin;
  }
}

export class CompatibilityError extends Error {
  constructor(message) {
    super(message);
    this.name = "CompatibilityError";
    this.code = "incompatible_accounts_contract";
  }
}

function versionParts(value) {
  return String(value || "0.0.0")
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function versionAtLeast(current, minimum) {
  const left = versionParts(current);
  const right = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new CompatibilityError("Accounts must use HTTPS outside local development.");
  }
  return url.toString().replace(/\/$/, "");
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    throw new AuthProviderError("server_error", { status: response.status });
  }
}

function oauthError(payload, response) {
  const code = typeof payload?.error === "string" ? payload.error : "server_error";
  return new AuthProviderError(code, {
    status: response.status,
    requiresLogin: code === "invalid_grant" || code === "access_denied" || code === "expired_token",
  });
}

function tokenResponse(payload, response) {
  if (!response.ok) throw oauthError(payload, response);
  if (
    typeof payload?.access_token !== "string" ||
    typeof payload?.refresh_token !== "string" ||
    !Number.isFinite(Number(payload?.expires_in))
  ) {
    throw new AuthProviderError("server_error", { status: response.status });
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresInSeconds: Number(payload.expires_in),
    scopes: typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [],
  };
}

export class ElixpoAuthProvider extends AuthProvider {
  constructor({
    accountsBaseUrl = "https://accounts.elixpo.com",
    clientId = "lixblogs-cli-prod",
    audience = "blogs.elixpo.com",
    cliVersion = "1.2.0",
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    super();
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    this.accountsBaseUrl = normalizeBaseUrl(accountsBaseUrl);
    this.clientId = clientId;
    this.audience = audience;
    this.cliVersion = cliVersion;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this._metadata = null;
    this._discoveryPromise = null;
  }

  get providerId() {
    return "elixpo";
  }

  async _fetch(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        ...options,
        signal: options.signal || controller.signal,
        headers: { accept: "application/json", ...options.headers },
      });
    } catch {
      throw new AuthProviderError("temporarily_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  async discover({ scopes = [] } = {}) {
    if (!this._metadata) {
      if (!this._discoveryPromise) this._discoveryPromise = this._loadDiscovery();
      try {
        this._metadata = await this._discoveryPromise;
      } finally {
        this._discoveryPromise = null;
      }
    }

    const unsupported = scopes.filter((scope) => !this._metadata.scopes_supported.includes(scope));
    if (unsupported.length) throw new AuthProviderError("invalid_scope");
    return this._metadata;
  }

  async _loadDiscovery() {
    const response = await this._fetch(`${this.accountsBaseUrl}/.well-known/oauth-authorization-server`);
    const metadata = await responseJson(response);
    if (!response.ok) throw new AuthProviderError("temporarily_unavailable", { status: response.status });

    const contractMajor = versionParts(metadata.elixpo_contract_version)[0];
    if (contractMajor !== SUPPORTED_CONTRACT_MAJOR) {
      throw new CompatibilityError("Accounts uses an unsupported device-flow contract version.");
    }
    if (!versionAtLeast(this.cliVersion, metadata.elixpo_min_compatible_cli_version)) {
      throw new CompatibilityError(
        `This CLI is too old for Accounts. Upgrade to version ${metadata.elixpo_min_compatible_cli_version} or newer.`,
      );
    }
    if (!Array.isArray(metadata.grant_types_supported) || !metadata.grant_types_supported.includes(DEVICE_GRANT)) {
      throw new CompatibilityError("Accounts does not advertise OAuth device authorization.");
    }

    const requiredEndpoints = [
      "device_authorization_endpoint",
      "token_endpoint",
      "revocation_endpoint",
    ];
    for (const field of requiredEndpoints) {
      if (typeof metadata[field] !== "string") {
        throw new CompatibilityError(`Accounts discovery is missing ${field}.`);
      }
      const endpoint = new URL(metadata[field]);
      const accounts = new URL(this.accountsBaseUrl);
      if (endpoint.origin !== accounts.origin) {
        throw new CompatibilityError(`Accounts discovery returned an untrusted ${field}.`);
      }
    }

    return {
      ...metadata,
      scopes_supported: Array.isArray(metadata.scopes_supported) ? metadata.scopes_supported : [],
    };
  }

  async requestDeviceCode({ scopes }) {
    const metadata = await this.discover({ scopes });
    const response = await this._fetch(metadata.device_authorization_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        scope: scopes.join(" "),
        audience: this.audience,
      }),
    });
    const payload = await responseJson(response);
    if (!response.ok) throw oauthError(payload, response);
    if (
      typeof payload.device_code !== "string" ||
      typeof payload.user_code !== "string" ||
      typeof payload.verification_uri !== "string"
    ) {
      throw new AuthProviderError("server_error", { status: response.status });
    }
    return {
      deviceCode: payload.device_code,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      verificationUriComplete: payload.verification_uri_complete || payload.verification_uri,
      expiresInSeconds: Number(payload.expires_in) || 600,
      pollIntervalSeconds: Number(payload.interval) || 5,
    };
  }

  async pollDeviceCode({ deviceCode }) {
    const metadata = await this.discover();
    const body = new URLSearchParams({
      grant_type: DEVICE_GRANT,
      device_code: deviceCode,
      client_id: this.clientId,
    });
    const response = await this._fetch(metadata.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await responseJson(response);
    if (response.ok) return { status: "approved", token: tokenResponse(payload, response) };
    if (payload?.error === "authorization_pending") return { status: "pending" };
    if (payload?.error === "slow_down") {
      const polling = metadata.elixpo_device_flow_polling || {};
      const increase = Math.max(
        5,
        Number(polling.slow_down_interval_seconds || 10) - Number(polling.interval_seconds || 5),
      );
      return { status: "slow_down", pollIntervalIncreaseSeconds: increase };
    }
    if (payload?.error === "access_denied") return { status: "denied" };
    if (payload?.error === "expired_token") return { status: "expired" };
    throw oauthError(payload, response);
  }

  async refresh({ refreshToken, scopes }) {
    const metadata = await this.discover({ scopes: scopes || [] });
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
    });
    if (scopes?.length) body.set("scope", scopes.join(" "));
    const response = await this._fetch(metadata.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await responseJson(response);
    return tokenResponse(payload, response);
  }

  async revoke({ token }) {
    const metadata = await this.discover();
    const response = await this._fetch(metadata.revocation_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, client_id: this.clientId }),
    });
    if (!response.ok) {
      const payload = await responseJson(response);
      throw oauthError(payload, response);
    }
  }
}
