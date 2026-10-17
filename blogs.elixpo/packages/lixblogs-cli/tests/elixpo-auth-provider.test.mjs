import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AuthProviderError,
  CompatibilityError,
  ElixpoAuthProvider,
} from "../src/auth/ElixpoAuthProvider.js";

const discovery = {
  issuer: "https://accounts.elixpo.com",
  device_authorization_endpoint: "https://accounts.elixpo.com/api/auth/device/authorize",
  token_endpoint: "https://accounts.elixpo.com/api/auth/token",
  revocation_endpoint: "https://accounts.elixpo.com/api/auth/revoke",
  scopes_supported: ["openid", "profile", "lixblogs:blog:read"],
  grant_types_supported: ["refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
  elixpo_contract_version: "1.0.0",
  elixpo_min_compatible_cli_version: "0.1.0",
  elixpo_device_flow_polling: { interval_seconds: 5, slow_down_interval_seconds: 10 },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerWith(sequence, requests = []) {
  return new ElixpoAuthProvider({
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      const next = sequence.shift();
      if (!next) throw new Error("unexpected fetch");
      return next;
    },
  });
}

test("real provider discovers Accounts but requests the blogs.elixpo.com audience", async () => {
  const requests = [];
  const provider = providerWith([
    json(discovery),
    json({
      device_code: "device-secret",
      user_code: "ABCD-EFGH",
      verification_uri: "https://accounts.elixpo.com/device",
      verification_uri_complete: "https://accounts.elixpo.com/device?user_code=ABCD-EFGH",
      expires_in: 600,
      interval: 5,
    }),
  ], requests);

  const result = await provider.requestDeviceCode({ scopes: ["openid", "lixblogs:blog:read"] });
  assert.equal(result.userCode, "ABCD-EFGH");
  assert.equal(requests[0].url, "https://accounts.elixpo.com/.well-known/oauth-authorization-server");
  assert.equal(requests[1].url, discovery.device_authorization_endpoint);
  const requestBody = JSON.parse(requests[1].options.body);
  assert.equal(requestBody.audience, "blogs.elixpo.com");
  assert.doesNotMatch(requests[1].url, /api\.lixblogs\.com/);
});

test("poll maps pending and slow_down without exposing the device code", async () => {
  const provider = providerWith([
    json(discovery),
    json({ error: "authorization_pending" }, 400),
    json({ error: "slow_down" }, 400),
  ]);
  assert.deepEqual(await provider.pollDeviceCode({ deviceCode: "secret-device-code" }), { status: "pending" });
  assert.deepEqual(await provider.pollDeviceCode({ deviceCode: "secret-device-code" }), {
    status: "slow_down",
    pollIntervalIncreaseSeconds: 5,
  });
});

test("refresh consumes the rotated refresh token returned by Accounts", async () => {
  const provider = providerWith([
    json(discovery),
    json({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 900,
      scope: "openid lixblogs:blog:read",
    }),
  ]);
  const token = await provider.refresh({ refreshToken: "old-refresh" });
  assert.equal(token.refreshToken, "new-refresh");
  assert.deepEqual(token.scopes, ["openid", "lixblogs:blog:read"]);
});

test("invalid refresh requires login and never includes a token in the error", async () => {
  const secret = "refresh-token-that-must-not-leak";
  const provider = providerWith([
    json(discovery),
    json({ error: "invalid_grant", error_description: `rejected ${secret}` }, 400),
  ]);
  await assert.rejects(
    () => provider.refresh({ refreshToken: secret }),
    (error) => {
      assert.ok(error instanceof AuthProviderError);
      assert.equal(error.requiresLogin, true);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

test("discovery rejects incompatible CLI versions before device issuance", async () => {
  const provider = providerWith([
    json({ ...discovery, elixpo_min_compatible_cli_version: "9.0.0" }),
  ]);
  await assert.rejects(
    () => provider.requestDeviceCode({ scopes: ["openid"] }),
    CompatibilityError,
  );
});

test("discovery rejects endpoints on an origin other than Accounts", async () => {
  const provider = providerWith([
    json({ ...discovery, token_endpoint: "https://attacker.example/token" }),
  ]);
  await assert.rejects(
    () => provider.requestDeviceCode({ scopes: ["openid"] }),
    /untrusted token_endpoint/,
  );
});
