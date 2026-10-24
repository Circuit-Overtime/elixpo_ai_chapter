import { test } from "node:test";
import assert from "node:assert/strict";
import {
  redactObject,
  safeJsonStringify,
  redactErrorMessage,
} from "../src/config/redact.js";

test("redactObject: redacts fields with sensitive key names", () => {
  const input = {
    accessToken: "mock-access-abc123",
    refreshToken: "mock-refresh-def456",
    profileId: "default",
  };
  const result = redactObject(input);
  assert.equal(result.accessToken, "[REDACTED]");
  assert.equal(result.refreshToken, "[REDACTED]");
  assert.equal(result.profileId, "default"); // non-sensitive field untouched
});

test("redactObject: redacts nested sensitive fields", () => {
  const input = {
    profile: { name: "default", credentials: { refreshToken: "mock-refresh-xyz" } },
  };
  const result = redactObject(input);
  assert.equal(result.profile.credentials.refreshToken, "[REDACTED]");
  assert.equal(result.profile.name, "default");
});

test("redactObject: redacts token-like values even under an unrecognized key name", () => {
  // Defense in depth: even if a field is renamed and doesn't match the
  // sensitive-key pattern, a value that looks like a token is still caught.
  const input = { someRenamedField: "mock-access-shouldnotleak" };
  const result = redactObject(input);
  assert.equal(result.someRenamedField, "[REDACTED]");
});

test("redactObject: handles arrays", () => {
  const input = [{ refreshToken: "mock-refresh-a" }, { refreshToken: "mock-refresh-b" }];
  const result = redactObject(input);
  assert.equal(result[0].refreshToken, "[REDACTED]");
  assert.equal(result[1].refreshToken, "[REDACTED]");
});

test("safeJsonStringify: produces JSON with no raw token substrings", () => {
  const input = {
    accessToken: "mock-access-verysecret",
    refreshToken: "mock-refresh-verysecret",
  };
  const json = safeJsonStringify(input);
  assert.doesNotMatch(json, /verysecret/);
  assert.match(json, /REDACTED/);
});

test("redactErrorMessage: strips token-like substrings from free-form error text", () => {
  const message = "failed to refresh mock-refresh-abc123 — token invalid";
  const redacted = redactErrorMessage(message);
  assert.doesNotMatch(redacted, /mock-refresh-abc123/);
  assert.match(redacted, /REDACTED/);
});

test("redactErrorMessage: leaves non-token error messages unchanged", () => {
  const message = "Device code expired before login was approved.";
  assert.equal(redactErrorMessage(message), message);
});

test("redactErrorMessage: handles Bearer-prefixed tokens", () => {
  const message = "Authorization failed for Bearer abc123.xyz789";
  const redacted = redactErrorMessage(message);
  assert.doesNotMatch(redacted, /abc123\.xyz789/);
});

test("personal access tokens are redacted in values and free-form errors", () => {
  const token = `lix_pat_${"a".repeat(43)}`;
  assert.equal(redactObject({ value: token }).value, "[REDACTED]");
  assert.equal(redactErrorMessage(`Request failed for ${token}`), "Request failed for [REDACTED]");
});
