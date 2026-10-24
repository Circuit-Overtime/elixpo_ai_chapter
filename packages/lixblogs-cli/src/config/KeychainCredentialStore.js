/**
 * KeychainCredentialStore — real OS-keychain-backed CredentialStore.
 *
 * Uses @napi-rs/keyring: macOS Keychain, Windows Credential Manager, Linux
 * Secret Service/libsecret. Chosen over `keytar` because keytar is
 * archived/deprecated (last release Feb 2022, no longer maintained);
 * @napi-rs/keyring is the actively maintained equivalent with a similar API.
 *
 * Each profile's credentials are stored as a single JSON-serialized secret
 * under a per-profile keychain entry — one entry per profile, not one
 * entry per token field, so multi-profile isolation (see THREAT_MODEL.md
 * §5) maps directly onto separate keychain entries rather than a shared
 * blob multiple profiles could collide in.
 *
 * This class throws on any underlying failure — it does NOT catch and
 * silently return null/succeed. Per #135's "explicit opt-in fallback"
 * requirement, silent degradation here would be exactly the wrong
 * behavior; the caller (via GatedCredentialStore, see CredentialStore.js)
 * is responsible for catching this and prompting for explicit opt-in.
 */

import { Entry } from "@napi-rs/keyring";
import { CredentialStore } from "./CredentialStore.js";

const SERVICE_NAME = "lixblogs-cli";
const PROBE_PROFILE_ID = "__lixblogs_availability_probe__";

function entryFor(profileId) {
  return new Entry(SERVICE_NAME, profileId);
}

/**
 * Checks whether the OS keychain backend is actually reachable.
 *
 * IMPORTANT, discovered empirically while building this (not assumed):
 * on at least one backend (headless Linux, no Secret Service running),
 * Entry.getPassword() on a missing entry returns null instead of
 * throwing — even when the backend is completely unreachable. That means
 * get() alone cannot distinguish "nothing stored yet" from "keychain is
 * broken." Entry.setPassword() DOES throw reliably when the backend is
 * unreachable in that same environment, so this probe uses a harmless
 * write+delete round-trip to get a trustworthy signal there, rather than
 * inferring availability from get().
 *
 * KNOWN LIMITATION, also discovered empirically (not theoretical): on at
 * least one WSL setup, a probe call that fails (AccessDenied) can be
 * followed by an unrelated Entry's setPassword() succeeding moments
 * later, even though the probe itself correctly reported unavailability.
 * This matches a documented upstream keyring-rs issue where WSL with
 * systemd enabled has only a Secret Service *session* collection and no
 * *default* collection — the first call against the (missing) default
 * collection fails, but the backend appears to recover or fall back on
 * a subsequent call. Practical implication: this probe is a best-effort
 * signal, not a guarantee — a single probe result should be trusted for
 * the immediate decision (fail vs. proceed) but must not be assumed to
 * hold true for every subsequent call in the same process on every
 * platform. If this proves unreliable enough in practice, a more robust
 * approach (e.g. re-probing before every real operation, or shipping a
 * documented "known platforms" support matrix) should be a follow-up.
 *
 * @returns {Promise<{ available: boolean, error?: string }>}
 */
export async function probeKeychainAvailability() {
  const entry = entryFor(PROBE_PROFILE_ID);
  try {
    entry.setPassword("probe");
    entry.deletePassword();
    return { available: true };
  } catch (err) {
    // The underlying native error can include a multi-line Rust stack
    // trace in its message — take only the first line for anything shown
    // to a user; the full message is still available via err if needed
    // for debugging (e.g. --verbose diagnostics, a later issue).
    const firstLine = String(err.message ?? err).split("\n")[0].trim();
    return { available: false, error: firstLine };
  }
}

export class KeychainCredentialStore extends CredentialStore {
  async get(profileId) {
    const entry = entryFor(profileId);
    let raw;
    try {
      raw = entry.getPassword();
    } catch (err) {
      // @napi-rs/keyring throws on some platforms/backends when no entry
      // exists yet — that's a legitimate "not logged in" case, not a
      // keychain-unavailable failure. Distinguish by message rather than
      // swallowing all errors, so real unavailability still propagates.
      if (isNotFoundError(err)) {
        return null;
      }
      throw err;
    }

    // On some platforms/backends, a missing entry returns null/undefined
    // rather than throwing (observed behavior, not assumed) — treat that
    // the same as "not logged in," not as a parse error.
    if (raw === null || raw === undefined) {
      return null;
    }

    return JSON.parse(raw);
  }

  async set(profileId, credentials) {
    const entry = entryFor(profileId);
    entry.setPassword(JSON.stringify(credentials));
  }

  async delete(profileId) {
    const entry = entryFor(profileId);
    try {
      entry.deletePassword();
    } catch (err) {
      if (isNotFoundError(err)) {
        return; // deleting something that isn't there is not an error
      }
      throw err;
    }
  }

  async listProfiles() {
    // @napi-rs/keyring has no "list all entries for a service" API — OS
    // keychains generally don't expose enumeration without extra
    // permissions. Tracking known profile IDs is therefore NOT this
    // class's job; see ProfileRegistry (profileRegistry.js) for how the
    // CLI tracks "which profiles have I ever logged into" separately from
    // the keychain itself.
    throw new Error(
      "KeychainCredentialStore.listProfiles is not supported directly — " +
        "use ProfileRegistry to track known profile IDs, then look up each " +
        "one via get()."
    );
  }
}

function isNotFoundError(err) {
  const message = String(err?.message ?? "");
  return /no such|not found|nosuchkeyring|nosuchitem/i.test(message);
}

/**
 * RegistryBackedKeychainCredentialStore — combines KeychainCredentialStore
 * (actual secret storage) with ProfileRegistry (non-sensitive list of known
 * profile IDs) to satisfy the full CredentialStore interface, including
 * listProfiles(), which the raw keychain store alone cannot support.
 *
 * This is the class CLI wiring should actually construct for real use —
 * KeychainCredentialStore and ProfileRegistry are exported separately
 * mainly so each can be tested/reasoned about independently.
 */
export class RegistryBackedKeychainCredentialStore extends CredentialStore {
  /**
   * @param {import("./ProfileRegistry.js").ProfileRegistry} profileRegistry
   */
  constructor(profileRegistry) {
    super();
    this._keychain = new KeychainCredentialStore();
    this._registry = profileRegistry;
  }

  async get(profileId) {
    return this._keychain.get(profileId);
  }

  async set(profileId, credentials) {
    await this._keychain.set(profileId, credentials);
    await this._registry.add(profileId); // registry write after secret write succeeds
  }

  async delete(profileId) {
    await this._keychain.delete(profileId);
    await this._registry.remove(profileId);
  }

  async listProfiles() {
    return this._registry.list();
  }
}
