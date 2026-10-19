import { test } from "node:test";
import assert from "node:assert/strict";
import { createCredentialStore } from "../src/config/credentialStoreFactory.js";
import { CredentialStoreUnavailableError } from "../src/config/CredentialStore.js";
import { probeKeychainAvailability } from "../src/config/KeychainCredentialStore.js";
import { ProfileRegistry } from "../src/config/ProfileRegistry.js";
import { tmpdir } from "node:os";
import path from "node:path";

// These tests exercise the REAL keychain backend of whatever machine runs
// them, not a mock — this is intentional, since the whole point of this
// factory is correctly detecting real availability. In this sandbox
// (headless Linux, no Secret Service) the keychain is genuinely
// unavailable, which lets us test the real failure path rather than a
// simulated one. On a machine with a working keychain, the "available"
// branch below would exercise instead — both are written to pass either way.

test("probeKeychainAvailability: returns a definitive available/unavailable signal", async () => {
  const probe = await probeKeychainAvailability();
  assert.equal(typeof probe.available, "boolean");
  if (!probe.available) {
    assert.equal(typeof probe.error, "string");
  }
});

test("createCredentialStore: without --allow-insecure-fallback, throws clearly if keychain is unavailable (or succeeds if it's actually available on this machine)", async () => {
  const probe = await probeKeychainAvailability();

  if (probe.available) {
    // This machine has a real working keychain — factory should succeed.
    const store = await createCredentialStore({ allowInsecureFallback: false });
    assert.ok(store);
  } else {
    // No working keychain (true in this sandbox) — must fail loudly, not
    // silently return something that looks like it works.
    await assert.rejects(
      () => createCredentialStore({ allowInsecureFallback: false }),
      CredentialStoreUnavailableError
    );
  }
});

test("createCredentialStore: with --allow-insecure-fallback, always succeeds", async () => {
  const profileRegistry = new ProfileRegistry(path.join(tmpdir(), `lixblogs-factory-${process.pid}.json`));
  const store = await createCredentialStore({ allowInsecureFallback: true, profileRegistry });
  assert.ok(store);

  // Should be usable regardless of which backend it resolved to.
  await store.set("test-profile", {
    accessToken: "a",
    refreshToken: "r",
    expiresAt: Date.now() + 10000,
    scopes: ["read"],
  });
  const result = await store.get("test-profile");
  assert.equal(result.accessToken, "a");

  await store.delete("test-profile");
});
