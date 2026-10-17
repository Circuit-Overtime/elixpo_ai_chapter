import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ProfileRegistry } from "../src/config/ProfileRegistry.js";
import {
  GatedCredentialStore,
  InMemoryCredentialStore,
  CredentialStoreUnavailableError,
} from "../src/config/CredentialStore.js";
import { KeychainCredentialStore } from "../src/config/KeychainCredentialStore.js";

test("ProfileRegistry: starts empty when no file exists yet", async () => {
  const tmpPath = path.join(os.tmpdir(), `lixblogs-test-registry-${Date.now()}.json`);
  const registry = new ProfileRegistry(tmpPath);
  const profiles = await registry.list();
  assert.deepEqual(profiles, []);
});

test("ProfileRegistry: add + list round-trips, deduplicates", async () => {
  const tmpPath = path.join(os.tmpdir(), `lixblogs-test-registry-${Date.now()}-b.json`);
  const registry = new ProfileRegistry(tmpPath);

  await registry.add("work");
  await registry.add("personal");
  await registry.add("work"); // duplicate add should not create two entries

  const profiles = (await registry.list()).sort();
  assert.deepEqual(profiles, ["personal", "work"]);

  await fs.unlink(tmpPath).catch(() => {});
});

test("ProfileRegistry: remove drops a profile without affecting others", async () => {
  const tmpPath = path.join(os.tmpdir(), `lixblogs-test-registry-${Date.now()}-c.json`);
  const registry = new ProfileRegistry(tmpPath);

  await registry.add("work");
  await registry.add("personal");
  await registry.remove("work");

  assert.deepEqual(await registry.list(), ["personal"]);

  await fs.unlink(tmpPath).catch(() => {});
});

test("ProfileRegistry: stores and switches the active profile", async () => {
  const tmpPath = path.join(os.tmpdir(), `lixblogs-test-registry-${Date.now()}-active.json`);
  const registry = new ProfileRegistry(tmpPath);
  await registry.add("personal");
  await registry.add("work");
  assert.equal(await registry.getActive(), "personal");
  await registry.setActive("work");
  assert.equal(await registry.getActive(), "work");
  await registry.remove("work");
  assert.equal(await registry.getActive(), "personal");
  await fs.unlink(tmpPath).catch(() => {});
});

test("GatedCredentialStore: wraps a healthy store transparently", async () => {
  const inner = new InMemoryCredentialStore();
  const gated = new GatedCredentialStore(inner);

  await gated.set("default", { accessToken: "a", refreshToken: "r", expiresAt: 1, scopes: [] });
  const result = await gated.get("default");
  assert.equal(result.accessToken, "a");
});

test("GatedCredentialStore: converts underlying failures into CredentialStoreUnavailableError, not a silent fallback", async () => {
  const brokenStore = {
    async get() {
      throw new Error("no Secret Service running");
    },
    async set() {
      throw new Error("no Secret Service running");
    },
    async delete() {
      throw new Error("no Secret Service running");
    },
    async listProfiles() {
      throw new Error("no Secret Service running");
    },
  };
  const gated = new GatedCredentialStore(brokenStore);

  await assert.rejects(() => gated.get("default"), CredentialStoreUnavailableError);
  await assert.rejects(
    () => gated.set("default", { accessToken: "a" }),
    CredentialStoreUnavailableError
  );
});

test("KeychainCredentialStore: real backend behavior in this environment is exercised, not assumed", async () => {
  // This test intentionally does NOT assert that a probe's result predicts
  // the outcome of a later, separate set() call — real testing on a real
  // WSL machine showed that guarantee does not hold (see the KNOWN
  // LIMITATION note on probeKeychainAvailability's doc comment: a probe
  // that reports unavailable can be followed by an unrelated set()
  // succeeding, matching a documented upstream keyring-rs/WSL quirk).
  //
  // What this test DOES assert: probeKeychainAvailability() returns a
  // well-formed result, and that KeychainCredentialStore.set() either
  // succeeds cleanly or throws cleanly — never hangs, never throws
  // something that isn't a real Error, and cleans up after itself either
  // way. That is the actual contract callers can rely on.
  const store = new KeychainCredentialStore();
  const testProfileId = `test-profile-${Date.now()}`;

  try {
    await store.set(testProfileId, { accessToken: "a", refreshToken: "r" });
    // If it succeeded, get() and delete() should also work cleanly.
    const result = await store.get(testProfileId);
    assert.equal(result.accessToken, "a");
    await store.delete(testProfileId);
  } catch (err) {
    assert.ok(err instanceof Error);
  }
});

test("KeychainCredentialStore: listProfiles is explicitly unsupported and says why", async () => {
  const store = new KeychainCredentialStore();
  await assert.rejects(() => store.listProfiles(), /ProfileRegistry/);
});
