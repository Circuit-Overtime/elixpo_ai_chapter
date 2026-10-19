/**
 * CredentialStore — abstracts OS keychain access for tokens.
 *
 * Per #135: "Store credentials in the OS keychain; require an explicit
 * opt-in fallback when unavailable." This means:
 *   - Default backend must be the real OS keychain (macOS Keychain,
 *     Windows Credential Manager, Linux Secret Service/libsecret)
 *   - Falling back to anything else (e.g. an encrypted file) requires the
 *     user to explicitly opt in at the moment it's needed — never silently
 *
 * This file defines the interface + a real backend wrapper. The actual
 * OS-level library (e.g. a keytar-alternative) is expected to be wired in
 * here; this scaffold ships with the interface, an in-memory store (tests
 * only — never for real use), and the opt-in-gated fallback path so the
 * commands built on top of this don't need to change once the real
 * keychain library is chosen and added as a dependency.
 */

export class CredentialStoreUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "CredentialStoreUnavailableError";
  }
}

export class CredentialStore {
  /**
   * @param {string} _profileId
   * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: number, scopes: string[] } | null>}
   */
  async get(_profileId) {
    throw new Error("CredentialStore.get must be implemented by subclass");
  }

  /**
   * @param {string} _profileId
   * @param {{ accessToken: string, refreshToken: string, expiresAt: number, scopes: string[] }} _credentials
   * @returns {Promise<void>}
   */
  async set(_profileId, _credentials) {
    throw new Error("CredentialStore.set must be implemented by subclass");
  }

  /**
   * @param {string} _profileId
   * @returns {Promise<void>} Must not throw if nothing was stored.
   */
  async delete(_profileId) {
    throw new Error("CredentialStore.delete must be implemented by subclass");
  }

  /**
   * @returns {Promise<string[]>} All profile IDs currently holding credentials.
   */
  async listProfiles() {
    throw new Error("CredentialStore.listProfiles must be implemented by subclass");
  }
}

/**
 * In-memory store — for tests only. Never use this for real credential
 * storage; it exists purely so command logic can be tested without an OS
 * keychain in CI.
 */
export class InMemoryCredentialStore extends CredentialStore {
  constructor() {
    super();
    /** @type {Map<string, object>} */
    this._store = new Map();
  }

  async get(profileId) {
    return this._store.get(profileId) ?? null;
  }

  async set(profileId, credentials) {
    this._store.set(profileId, credentials);
  }

  async delete(profileId) {
    this._store.delete(profileId);
  }

  async listProfiles() {
    return [...this._store.keys()];
  }
}

/**
 * Wraps a real OS-keychain-backed store, enforcing the "explicit opt-in
 * fallback" rule: if the underlying keychain library reports unavailable
 * (e.g. no Secret Service running on a headless Linux box), this does NOT
 * silently fall back — it throws CredentialStoreUnavailableError, and the
 * calling command is responsible for prompting the user for explicit
 * opt-in before constructing a fallback store instance.
 *
 * @param {CredentialStore} realStore - the actual OS-keychain-backed store
 */
export class GatedCredentialStore extends CredentialStore {
  constructor(realStore) {
    super();
    this._realStore = realStore;
  }

  async get(profileId) {
    try {
      return await this._realStore.get(profileId);
    } catch (err) {
      throw new CredentialStoreUnavailableError(
        `OS keychain is unavailable: ${err.message}. Re-run with an explicit ` +
          `fallback flag if you want to opt in to a less secure storage method.`
      );
    }
  }

  async set(profileId, credentials) {
    try {
      await this._realStore.set(profileId, credentials);
    } catch (err) {
      throw new CredentialStoreUnavailableError(
        `OS keychain is unavailable: ${err.message}. Re-run with an explicit ` +
          `fallback flag if you want to opt in to a less secure storage method.`
      );
    }
  }

  async delete(profileId) {
    try {
      await this._realStore.delete(profileId);
    } catch (err) {
      throw new CredentialStoreUnavailableError(`OS keychain is unavailable: ${err.message}`);
    }
  }

  async listProfiles() {
    try {
      return await this._realStore.listProfiles();
    } catch (err) {
      throw new CredentialStoreUnavailableError(`OS keychain is unavailable: ${err.message}`);
    }
  }
}
