import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAuthProvider } from "../src/auth/MockAuthProvider.js";
import { InMemoryCredentialStore } from "../src/config/CredentialStore.js";
import { authLogin } from "../src/commands/auth/login.js";
import { authStatus } from "../src/commands/auth/status.js";
import { authLogout } from "../src/commands/auth/logout.js";
import { authRevoke } from "../src/commands/auth/revoke.js";

// Fast, deterministic sleep for tests — real timing isn't the point here.
const instantSleep = () => Promise.resolve();

test("login: immediate approval stores credentials for the profile", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();
  const statuses = [];

  // Monkeypatch requestDeviceCode to force the APPROVE_IMMEDIATELY scenario,
  // since the command itself doesn't know about mock-specific scenario params.
  const originalRequest = provider.requestDeviceCode.bind(provider);
  provider.requestDeviceCode = (params) =>
    originalRequest({ ...params, scenario: "APPROVE_IMMEDIATELY" });

  const result = await authLogin({
    provider,
    credentialStore,
    profileId: "default",
    scopes: ["read", "draft"],
    sleep: instantSleep,
    onStatus: (s) => statuses.push(s),
  });

  assert.equal(result.ok, true);
  assert.equal(result.profileId, "default");

  const stored = await credentialStore.get("default");
  assert.ok(stored.accessToken);
  assert.ok(stored.refreshToken);
  assert.ok(stored.expiresAt > Date.now());

  assert.ok(statuses.some((s) => s.type === "verification_pending"));
  assert.ok(statuses.some((s) => s.type === "approved"));
});

test("login: resolved username replaces the implicit profile before credentials are stored", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();
  const originalRequest = provider.requestDeviceCode.bind(provider);
  provider.requestDeviceCode = (params) =>
    originalRequest({ ...params, scenario: "APPROVE_IMMEDIATELY" });

  const result = await authLogin({
    provider,
    credentialStore,
    profileId: "default",
    scopes: ["read"],
    sleep: instantSleep,
    resolveProfileId: async ({ accessToken, requestedProfileId }) => {
      assert.ok(accessToken);
      assert.equal(requestedProfileId, "default");
      return "elixpohere";
    },
  });

  assert.deepEqual(result, { ok: true, profileId: "elixpohere" });
  assert.equal(await credentialStore.get("default"), null);
  assert.ok(await credentialStore.get("elixpohere"));
});

test("login: denied login does not store credentials", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();

  const originalRequest = provider.requestDeviceCode.bind(provider);
  provider.requestDeviceCode = (params) => originalRequest({ ...params, scenario: "DENY" });

  const result = await authLogin({
    provider,
    credentialStore,
    profileId: "default",
    scopes: ["read"],
    sleep: instantSleep,
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /denied/i);
  assert.equal(await credentialStore.get("default"), null);
});

test("login: expired device code returns a clear failure", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();

  const originalRequest = provider.requestDeviceCode.bind(provider);
  provider.requestDeviceCode = (params) => originalRequest({ ...params, scenario: "EXPIRE" });

  const result = await authLogin({
    provider,
    credentialStore,
    profileId: "default",
    scopes: ["read"],
    sleep: instantSleep,
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /expired/i);
});

test("login: slow_down increases poll interval and eventually succeeds", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();
  const statuses = [];

  const originalRequest = provider.requestDeviceCode.bind(provider);
  provider.requestDeviceCode = (params) =>
    originalRequest({ ...params, scenario: "SLOW_DOWN_THEN_APPROVE" });

  const result = await authLogin({
    provider,
    credentialStore,
    profileId: "default",
    scopes: ["read"],
    sleep: instantSleep,
    onStatus: (s) => statuses.push(s),
  });

  assert.equal(result.ok, true);
  assert.ok(statuses.some((s) => s.type === "slow_down"));
});

test("login: optionally opens the browser with the verification URL", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();
  let openedUrl = null;

  const originalRequest = provider.requestDeviceCode.bind(provider);
  provider.requestDeviceCode = (params) =>
    originalRequest({ ...params, scenario: "APPROVE_IMMEDIATELY" });

  await authLogin({
    provider,
    credentialStore,
    profileId: "default",
    scopes: ["read"],
    sleep: instantSleep,
    openBrowser: async (url) => {
      openedUrl = url;
    },
  });

  assert.ok(openedUrl);
  assert.match(openedUrl, /^https:\/\//);
});

test("status: reports not logged in for a profile with no stored credentials", async () => {
  const credentialStore = new InMemoryCredentialStore();
  const result = await authStatus({ credentialStore, profileId: "default" });
  assert.deepEqual(result, [{ profileId: "default", loggedIn: false }]);
});

test("status: reports logged in with scopes, and detects expiry", async () => {
  const credentialStore = new InMemoryCredentialStore();
  await credentialStore.set("default", {
    accessToken: "mock-access-abc",
    refreshToken: "mock-refresh-abc",
    expiresAt: Date.now() - 1000, // already expired
    scopes: ["read", "draft"],
  });

  const result = await authStatus({ credentialStore, profileId: "default" });
  assert.equal(result[0].loggedIn, true);
  assert.equal(result[0].expired, true);
  assert.deepEqual(result[0].scopes, ["read", "draft"]);
});

test("status: never includes the raw token in its output", async () => {
  const credentialStore = new InMemoryCredentialStore();
  await credentialStore.set("default", {
    accessToken: "mock-access-secret-value",
    refreshToken: "mock-refresh-secret-value",
    expiresAt: Date.now() + 10000,
    scopes: ["read"],
  });

  const result = await authStatus({ credentialStore, profileId: "default" });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /mock-access-secret-value/);
  assert.doesNotMatch(serialized, /mock-refresh-secret-value/);
});

test("status: with no profileId, reports on all stored profiles", async () => {
  const credentialStore = new InMemoryCredentialStore();
  await credentialStore.set("work", {
    accessToken: "a",
    refreshToken: "r",
    expiresAt: Date.now() + 10000,
    scopes: ["read"],
  });
  await credentialStore.set("personal", {
    accessToken: "a2",
    refreshToken: "r2",
    expiresAt: Date.now() + 10000,
    scopes: ["read"],
  });

  const result = await authStatus({ credentialStore });
  const profileIds = result.map((r) => r.profileId).sort();
  assert.deepEqual(profileIds, ["personal", "work"]);
});

test("logout: clears stored credentials for the profile", async () => {
  const credentialStore = new InMemoryCredentialStore();
  await credentialStore.set("default", {
    accessToken: "a",
    refreshToken: "r",
    expiresAt: Date.now() + 10000,
    scopes: ["read"],
  });

  const result = await authLogout({ credentialStore, profileId: "default" });
  assert.equal(result.ok, true);
  assert.equal(await credentialStore.get("default"), null);
});

test("logout: does not throw if the profile was never logged in", async () => {
  const credentialStore = new InMemoryCredentialStore();
  const result = await authLogout({ credentialStore, profileId: "never-logged-in" });
  assert.equal(result.ok, true);
});

test("revoke: refuses to run without explicit confirmation", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();
  await credentialStore.set("default", {
    accessToken: "a",
    refreshToken: "r",
    expiresAt: Date.now() + 10000,
    scopes: ["read"],
  });

  const result = await authRevoke({
    provider,
    credentialStore,
    profileId: "default",
    confirmed: false,
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /not confirmed/i);
  // Credentials must still be present — nothing should happen without consent.
  assert.ok(await credentialStore.get("default"));
});

test("revoke: with confirmation, revokes server-side and clears local storage", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();
  await credentialStore.set("default", {
    accessToken: "mock-access-xyz",
    refreshToken: "mock-refresh-xyz",
    expiresAt: Date.now() + 10000,
    scopes: ["read"],
  });

  const result = await authRevoke({
    provider,
    credentialStore,
    profileId: "default",
    confirmed: true,
  });

  assert.equal(result.ok, true);
  assert.equal(await credentialStore.get("default"), null);

  // The provider should now consider that refresh token revoked.
  await assert.rejects(() => provider.refresh({ refreshToken: "mock-refresh-xyz" }));
});

test("revoke: fails clearly if there's nothing to revoke for that profile", async () => {
  const provider = new MockAuthProvider();
  const credentialStore = new InMemoryCredentialStore();

  const result = await authRevoke({
    provider,
    credentialStore,
    profileId: "never-logged-in",
    confirmed: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /no stored credentials/i);
});
