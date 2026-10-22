import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiTokenConfigurationError,
  resolveApiToken,
} from "../src/config/apiToken.js";

const TOKEN = `lix_pat_${"a".repeat(43)}`;

test("resolves workflow credentials in deterministic order", async () => {
  const fromFlag = await resolveApiToken({
    flags: { tokenFile: "/run/secrets/lixblogs" },
    env: { LIXBLOGS_TOKEN: TOKEN, LIXBLOGS_TOKEN_FILE: "/ignored" },
    readFileImpl: async (path) => path === "/run/secrets/lixblogs" ? `${TOKEN}\n` : "",
  });
  assert.deepEqual(fromFlag, { token: TOKEN, source: "token-file" });

  const fromEnvironment = await resolveApiToken({
    env: { LIXBLOGS_TOKEN: TOKEN, LIXBLOGS_TOKEN_FILE: "/ignored" },
  });
  assert.deepEqual(fromEnvironment, { token: TOKEN, source: "environment" });

  const fromEnvironmentFile = await resolveApiToken({
    env: { LIXBLOGS_TOKEN_FILE: "/run/secrets/lixblogs" },
    readFileImpl: async () => TOKEN,
  });
  assert.deepEqual(fromEnvironmentFile, { token: TOKEN, source: "environment-file" });
});

test("rejects malformed token input without falling back to stored credentials", async () => {
  await assert.rejects(
    resolveApiToken({ env: { LIXBLOGS_TOKEN: "not-a-token" } }),
    ApiTokenConfigurationError,
  );
});
