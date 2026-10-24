import assert from "node:assert/strict";
import test from "node:test";
import { profileAliasFromIdentity } from "../src/commands/auth/profileAlias.js";

test("profile alias uses the authenticated LixBlogs username", async () => {
  const alias = await profileAliasFromIdentity({
    accessToken: "access-token",
    apiBaseUrl: "https://blogs.elixpo.com",
    fetchImpl: async (url, options) => {
      assert.equal(url.toString(), "https://blogs.elixpo.com/api/v1/me");
      assert.equal(options.headers.authorization, "Bearer access-token");
      return new Response(JSON.stringify({ data: { username: "elixpohere" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(alias, "elixpohere");
});

test("profile alias fails without a valid username", async () => {
  await assert.rejects(
    profileAliasFromIdentity({
      accessToken: "access-token",
      apiBaseUrl: "https://blogs.elixpo.com",
      fetchImpl: async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
    }),
    /resolve the signed-in username/,
  );
});
