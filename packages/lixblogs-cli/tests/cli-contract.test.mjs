import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXIT_CODES, errorEnvelope, normalizeCommand, requireConfirmation } from '../src/cli/contract.js';

test('top-level authentication commands preserve auth aliases', () => {
  assert.deepEqual(normalizeCommand(['login']), ['auth', 'login']);
  assert.deepEqual(normalizeCommand(['whoami']), ['auth', 'whoami']);
  assert.deepEqual(normalizeCommand(['use', 'work']), ['auth', 'use', 'work']);
  assert.deepEqual(normalizeCommand(['blog', 'list']), ['blog', 'list']);
});

test('machine errors have a stable redaction-friendly shape', () => {
  assert.deepEqual(errorEnvelope({ code: 'invalid_input', message: 'Bad input', hint: 'Fix it', requestId: 'r1' }), {
    ok: false,
    error: { code: 'invalid_input', message: 'Bad input', hint: 'Fix it', requestId: 'r1' },
  });
});

test('state transitions fail closed without explicit approval', () => {
  assert.throws(
    () => requireConfirmation({}, 'Publishing this blog'),
    (error) => error.code === 'confirmation_required' && error.exitCode === EXIT_CODES.CONFIRMATION,
  );
  assert.doesNotThrow(() => requireConfirmation({ yes: true }, 'Publishing this blog'));
});

test('CLI entrypoint exposes bearer-authenticated Cloudinary integration commands', () => {
  const entrypoint = readFileSync(new URL('../bin/lixblogs.mjs', import.meta.url), 'utf8');
  assert.match(entrypoint, /integrations cloudinary-status/);
  assert.match(entrypoint, /integrations cloudinary-disconnect --yes/);
  assert.match(entrypoint, /'cloudinary-status':/);
  assert.match(entrypoint, /'cloudinary-disconnect':/);
  assert.match(entrypoint, /disconnect cloudinary --yes/);
});

test('CLI entrypoint exposes Pollinations, media, history, and comment controls', () => {
  const entrypoint = readFileSync(new URL('../bin/lixblogs.mjs', import.meta.url), 'utf8');
  assert.match(entrypoint, /integrations pollinations-status/);
  assert.match(entrypoint, /media generate --prompt/);
  assert.match(entrypoint, /media delete <media-id> --yes/);
  assert.match(entrypoint, /blog restore-version <id>/);
  assert.match(entrypoint, /comment reply <blog-id>/);
});
