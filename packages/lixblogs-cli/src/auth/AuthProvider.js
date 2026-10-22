/**
 * AuthProvider — the single interface every auth implementation must satisfy.
 *
 * No CLI or API code should ever call a provider-specific method directly.
 * Everything goes through this interface, so swapping MockAuthProvider for
 * the real ElixpoAuthProvider (once accounts.elixpo.com confirms device-flow
 * support) requires no changes to calling code.
 *
 * See: elixpo/blogs.elixpo#137 for the full requirements this interface
 * exists to satisfy.
 */

/**
 * @typedef {Object} DeviceCodeResponse
 * @property {string} deviceCode - Opaque code the client polls with.
 * @property {string} userCode - Short code the user enters at verificationUri.
 * @property {string} verificationUri - URL the user visits to approve login.
 * @property {string} [verificationUriComplete] - Approval URL with user code pre-filled.
 * @property {number} expiresInSeconds - How long the device code is valid for.
 * @property {number} pollIntervalSeconds - Minimum seconds between poll attempts.
 */

/**
 * @typedef {Object} TokenResponse
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {number} expiresInSeconds
 * @property {string[]} scopes - Scopes actually granted (may be a subset of requested).
 */

/**
 * @typedef {"pending"|"approved"|"denied"|"expired"|"slow_down"} PollStatus
 */

/**
 * @typedef {Object} PollResult
 * @property {PollStatus} status
 * @property {TokenResponse} [token] - Present only when status === "approved".
 * @property {number} [pollIntervalIncreaseSeconds] - Present only when
 *   status === "slow_down". Caller must add this to its current polling
 *   interval before the next poll (RFC 8628 §3.5 behavior).
 */

export class AuthProvider {
  /**
   * Identifies which implementation this is. Used by the production safety
   * gate to refuse anything but the approved provider in production.
   * @returns {string} e.g. "mock" | "elixpo"
   */
  get providerId() {
    throw new Error("AuthProvider.providerId must be implemented by subclass");
  }

  /**
   * Start a device authorization request.
   * @param {{ scopes: string[] }} params
   * @returns {Promise<DeviceCodeResponse>}
   */
  async requestDeviceCode(_params) {
    throw new Error("AuthProvider.requestDeviceCode must be implemented by subclass");
  }

  /**
   * Poll for whether the user has approved/denied the device code yet.
   * Callers are responsible for respecting pollIntervalSeconds between calls.
   * @param {{ deviceCode: string }} params
   * @returns {Promise<PollResult>}
   */
  async pollDeviceCode(_params) {
    throw new Error("AuthProvider.pollDeviceCode must be implemented by subclass");
  }

  /**
   * Exchange a refresh token for a new access token.
   * @param {{ refreshToken: string, scopes?: string[] }} params
   * @returns {Promise<TokenResponse>}
   */
  async refresh(_params) {
    throw new Error("AuthProvider.refresh must be implemented by subclass");
  }

  /**
   * Revoke a token (access or refresh). Must not throw if already revoked.
   * @param {{ token: string }} params
   * @returns {Promise<void>}
   */
  async revoke(_params) {
    throw new Error("AuthProvider.revoke must be implemented by subclass");
  }
}
