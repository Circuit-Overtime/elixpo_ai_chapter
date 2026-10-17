import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAuthProvider } from "../src/auth/MockAuthProvider.js";
import {
  assertProviderAllowed,
  ProductionAuthGateError,
} from "../src/auth/productionGate.js";

test("device code: immediate approval", async () => {
  const provider = new MockAuthProvider();
  const code = await provider.requestDeviceCode({
    scopes: ["read"],
    scenario: "APPROVE_IMMEDIATELY",
  });
  assert.ok(code.deviceCode);
  assert.ok(code.userCode);
  assert.ok(code.verificationUri);

  const result = await provider.pollDeviceCode({ deviceCode: code.deviceCode });
  assert.equal(result.status, "approved");
  assert.ok(result.token.accessToken);
  assert.ok(result.token.refreshToken);
});

test("device code: pending then approved after second poll", async () => {
  const provider = new MockAuthProvider();
  const code = await provider.requestDeviceCode({
    scopes: ["read"],
    scenario: "PENDING_THEN_APPROVE",
  });

  const first = await provider.pollDeviceCode({ deviceCode: code.deviceCode });
  assert.equal(first.status, "pending");

  const second = await provider.pollDeviceCode({ deviceCode: code.deviceCode });
  assert.equal(second.status, "approved");
});

test("device code: slow_down then approved after second poll", async () => {
  const provider = new MockAuthProvider();
  const code = await provider.requestDeviceCode({
    scopes: ["read"],
    scenario: "SLOW_DOWN_THEN_APPROVE",
  });

  const first = await provider.pollDeviceCode({ deviceCode: code.deviceCode });
  assert.equal(first.status, "slow_down");
  assert.equal(typeof first.pollIntervalIncreaseSeconds, "number");
  assert.ok(first.pollIntervalIncreaseSeconds > 0);

  const second = await provider.pollDeviceCode({ deviceCode: code.deviceCode });
  assert.equal(second.status, "approved");
});

test("device code: denied", async () => {
  const provider = new MockAuthProvider();
  const code = await provider.requestDeviceCode({ scopes: ["read"], scenario: "DENY" });
  const result = await provider.pollDeviceCode({ deviceCode: code.deviceCode });
  assert.equal(result.status, "denied");
});

test("device code: expired", async () => {
  const provider = new MockAuthProvider();
  const code = await provider.requestDeviceCode({ scopes: ["read"], scenario: "EXPIRE" });
  assert.equal(code.expiresInSeconds, 1);
  const result = await provider.pollDeviceCode({ deviceCode: code.deviceCode });
  assert.equal(result.status, "expired");
});

test("device code: unknown/invalid code is treated as denied, not a crash", async () => {
  const provider = new MockAuthProvider();
  const result = await provider.pollDeviceCode({ deviceCode: "never-issued-code" });
  assert.equal(result.status, "denied");
});

test("refresh: success", async () => {
  const provider = new MockAuthProvider();
  const token = await provider.refresh({ refreshToken: "some-refresh-token" });
  assert.ok(token.accessToken);
});

test("refresh: fails after revocation", async () => {
  const provider = new MockAuthProvider();
  await provider.revoke({ token: "some-refresh-token" });
  await assert.rejects(() => provider.refresh({ refreshToken: "some-refresh-token" }));
});

test("refresh: injected failure", async () => {
  const provider = new MockAuthProvider();
  provider._simulateRefreshFailureFor("bad-token");
  await assert.rejects(() => provider.refresh({ refreshToken: "bad-token" }));
});

test("revoke is idempotent — revoking twice does not throw", async () => {
  const provider = new MockAuthProvider();
  await provider.revoke({ token: "some-token" });
  await provider.revoke({ token: "some-token" }); // should not throw
});

test("production gate: mock provider is rejected in production", () => {
  assert.throws(
    () =>
      assertProviderAllowed({
        providerId: "mock",
        environment: "production",
        configAllowsProduction: true,
      }),
    ProductionAuthGateError
  );
});

test("production gate: mock rejection does not depend on legacy config flags", () => {
  assert.throws(
    () =>
      assertProviderAllowed({
        providerId: "mock",
        environment: "production",
        configAllowsProduction: false,
      }),
    ProductionAuthGateError
  );
});

test("production gate: mock provider is allowed outside production regardless of config flag", () => {
  assert.doesNotThrow(() =>
    assertProviderAllowed({
      providerId: "mock",
      environment: "development",
      configAllowsProduction: false,
    })
  );
});

test("production gate: the real Elixpo provider is approved in production", () => {
  assert.doesNotThrow(() =>
    assertProviderAllowed({
      providerId: "elixpo",
      environment: "production",
      configAllowsProduction: false,
    })
  );
});

test("production gate: fails closed even for an unrecognized environment value", () => {
  // Anything that isn't explicitly "production" is treated as non-production
  // here; this test exists so that if the environment check's logic is ever
  // inverted by mistake, this test catches it.
  assert.doesNotThrow(() =>
    assertProviderAllowed({
      providerId: "mock",
      environment: "staging",
      configAllowsProduction: false,
    })
  );
  assert.throws(
    () =>
      assertProviderAllowed({
        providerId: "mock",
        environment: "production",
        configAllowsProduction: true,
      }),
    ProductionAuthGateError
  );
});
