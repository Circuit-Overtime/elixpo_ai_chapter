/**
 * credentialStoreFactory.js
 *
 * Real OS-keychain storage is now wired in (KeychainCredentialStore, via
 * @napi-rs/keyring — see that file for why it was chosen over keytar).
 *
 * Per #135: "require an explicit opt-in fallback when unavailable." This
 * means: if the keychain genuinely can't be used (e.g. no Secret Service
 * running, headless environment), this factory does NOT silently fall
 * back to something less secure. It throws CredentialStoreUnavailableError
 * with a clear message; the CLI entry point is responsible for surfacing
 * that to the user and requiring an explicit --allow-insecure-fallback
 * flag (or equivalent) before constructing InMemoryCredentialStore for
 * real use. There is currently no non-memory fallback implementation
 * (e.g. encrypted file) — InMemoryCredentialStore does not persist between
 * runs, so using it as a "fallback" is only acceptable for local dev/testing,
 * not as a real opt-in fallback for end users. Building a real persistent
 * fallback (e.g. an encrypted-file-backed store) is out of scope here and
 * should be a follow-up if keychain unavailability turns out to be common
 * in practice.
 */

import {
  GatedCredentialStore,
  InMemoryCredentialStore,
  CredentialStoreUnavailableError,
} from "./CredentialStore.js";
import {
  RegistryBackedKeychainCredentialStore,
  probeKeychainAvailability,
} from "./KeychainCredentialStore.js";
import { ProfileRegistry } from "./ProfileRegistry.js";

/**
 * @param {{ allowInsecureFallback?: boolean }} [options]
 * @returns {Promise<import("./CredentialStore.js").CredentialStore>}
 */
export async function createCredentialStore({ allowInsecureFallback = false, profileRegistry } = {}) {
  // Proactively probe availability with a real write+delete round-trip
  // rather than relying on get() to surface failures — see
  // probeKeychainAvailability's doc comment for why get() alone is not
  // trustworthy for this on every backend.
  const probe = await probeKeychainAvailability();

  if (!probe.available) {
    if (!allowInsecureFallback) {
      throw new CredentialStoreUnavailableError(
        `OS keychain is unavailable: ${probe.error}. Re-run with an explicit ` +
          `fallback flag if you want to opt in to a less secure storage method.`
      );
    }
    process.stderr.write(
      `warning: OS keychain unavailable (${probe.error}); using in-memory ` +
        `fallback because --allow-insecure-fallback was passed. Credentials ` +
        `will NOT persist between CLI runs.\n`
    );
    return new InMemoryCredentialStore();
  }

  const registry = profileRegistry || new ProfileRegistry();
  const realStore = new RegistryBackedKeychainCredentialStore(registry);
  return new GatedCredentialStore(realStore);
}
