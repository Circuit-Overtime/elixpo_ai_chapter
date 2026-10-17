import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "../src/config/config.js";
import { createAuthProvider } from "../src/config/providerFactory.js";

test("production defaults separate Accounts auth from the Blogs resource API", () => {
  const config = resolveConfig({ env: {} });
  assert.equal(config.accountsBaseUrl, "https://accounts.elixpo.com");
  assert.equal(config.apiBaseUrl, "https://blogs.elixpo.com");
  assert.equal(config.audience, "blogs.elixpo.com");
  assert.equal(config.authProvider, "elixpo");
  assert.doesNotMatch(config.apiBaseUrl, /api\.lixblogs\.com/);
});

test("mock provider requires an explicit non-production environment", () => {
  const production = resolveConfig({
    flags: { authProvider: "mock" },
    env: {},
  });
  assert.throws(() => createAuthProvider(production), /cannot run in production/);

  const development = resolveConfig({
    flags: { env: "development", authProvider: "mock" },
    env: {},
  });
  assert.equal(createAuthProvider(development).providerId, "mock");
});
