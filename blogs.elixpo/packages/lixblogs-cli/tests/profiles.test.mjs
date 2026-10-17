import { test } from "node:test";
import assert from "node:assert/strict";
import { authProfiles, authUse } from "../src/commands/auth/profiles.js";
import { InMemoryCredentialStore } from "../src/config/CredentialStore.js";

function registry(initial = ["personal", "work"]) {
  let active = initial[0] || null;
  return {
    async getActive() { return active; },
    async setActive(profileId) {
      if (!initial.includes(profileId)) throw new Error("missing profile");
      active = profileId;
    },
  };
}

test("profiles list safe metadata and mark the active profile", async () => {
  const credentialStore = new InMemoryCredentialStore();
  await credentialStore.set("personal", {
    accessToken: "secret-access",
    refreshToken: "secret-refresh",
    expiresAt: Date.now() + 60_000,
    scopes: ["lixblogs:blog:read"],
  });
  const result = await authProfiles({ credentialStore, profileRegistry: registry() });
  assert.equal(result.activeProfile, "personal");
  assert.equal(result.profiles[0].active, true);
  assert.doesNotMatch(JSON.stringify(result), /secret-access|secret-refresh/);
});

test("auth use switches only to a profile with stored credentials", async () => {
  const credentialStore = new InMemoryCredentialStore();
  await credentialStore.set("work", {
    accessToken: "a",
    refreshToken: "r",
    expiresAt: Date.now() + 60_000,
    scopes: [],
  });
  const profileRegistry = registry(["work"]);
  assert.deepEqual(
    await authUse({ credentialStore, profileRegistry, profileId: "work" }),
    { ok: true, profileId: "work" },
  );
  const missing = await authUse({ credentialStore, profileRegistry, profileId: "personal" });
  assert.equal(missing.ok, false);
});
