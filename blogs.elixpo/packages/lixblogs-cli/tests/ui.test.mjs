import assert from "node:assert/strict";
import test from "node:test";
import {
  colorEnabled,
  errorLine,
  infoLine,
  loginChallenge,
  startProgress,
  successLine,
  warningLine,
  withProgress,
} from "../src/cli/ui.js";

test("device login card remains useful without a TTY or colors", () => {
  const card = loginChallenge({
    url: "https://accounts.elixpo.com/device?user_code=ABCD-EFGH",
    code: "ABCD-EFGH",
    expiresInSeconds: 600,
    profile: "test",
    interactive: false,
  });
  assert.match(card, /Open the URL in any browser/);
  assert.match(card, /No localhost callback or exposed port is required/);
  assert.match(card, /test \(local credential slot\)/);
  assert.doesNotMatch(card, /\u001b\[/);
});

test("NO_COLOR disables terminal styling", () => {
  assert.equal(colorEnabled({ isTTY: true }, { NO_COLOR: "1", TERM: "xterm" }), false);
  assert.equal(colorEnabled({ isTTY: true }, { TERM: "xterm" }), true);
});

test("implicit login explains that the username becomes the profile alias", () => {
  const card = loginChallenge({
    url: "https://accounts.elixpo.com/device?user_code=ABCD-EFGH",
    code: "ABCD-EFGH",
    expiresInSeconds: 600,
    profile: null,
    interactive: true,
  });
  assert.match(card, /your Accounts username after approval/);
  assert.doesNotMatch(card, /default \(local credential slot\)/);
});

test("interactive progress renders and clears on completion", () => {
  const writes = [];
  const progress = startProgress("Uploading image…", {
    stream: { isTTY: true, write: (value) => writes.push(value) },
    intervalMs: 10_000,
    color: true,
  });
  progress.stop();
  assert.match(writes[0], /Uploading image/);
  assert.match(writes[0], /\u001b\[38;5;245mUploading image/);
  assert.equal(writes.at(-1), "\r\u001b[2K");
});

test("machine-readable commands never emit progress output", async () => {
  const writes = [];
  const result = await withProgress(
    { json: true, "no-input": true },
    "Loading…",
    async () => "done",
    { stream: { isTTY: true, write: (value) => writes.push(value) } },
  );
  assert.equal(result, "done");
  assert.deepEqual(writes, []);
});

test("status lines use distinct terminal tones without affecting plain output", () => {
  assert.match(successLine("Published.", true), /\u001b\[38;5;42m/);
  assert.match(warningLine("Dry run.", true), /\u001b\[38;5;220m/);
  assert.match(infoLine("Loading.", true), /\u001b\[38;5;245m/);
  assert.match(errorLine("Failed.", true), /\u001b\[38;5;203m/);
  assert.equal(successLine("Published.", false), "  ✓ Published.");
  assert.equal(warningLine("Dry run.", false), "  ! Dry run.");
});
