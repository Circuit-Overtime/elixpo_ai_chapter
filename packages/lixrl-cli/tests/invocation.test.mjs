import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInvocation } from '../src/invocation.js';

test('unknown commands fail before credential lookup', () => {
  assert.throws(
    () => validateInvocation('ursl', undefined, [], {}),
    (error) => error.code === 'unknown_command' && /Unknown command "ursl"/.test(error.message),
  );
});

test('bulk creation requires --file before credential lookup', () => {
  assert.throws(
    () => validateInvocation('urls', 'bulk-create', [], {}),
    (error) => error.code === 'invalid_usage' && /--file/.test(error.message),
  );
});

test('destructive confirmation is validated before credential lookup', () => {
  assert.throws(
    () => validateInvocation('urls', 'delete', ['abc123'], {}),
    (error) => error.code === 'confirmation_required' && error.exitCode === 5 && /--yes/.test(error.message),
  );
});

test('valid commands pass preflight validation', () => {
  assert.equal(validateInvocation('urls', 'bulk-create', [], { file: 'links.json' }), undefined);
  assert.equal(validateInvocation('qr', 'https://example.com', [], {}), undefined);
  assert.equal(validateInvocation('whoami', undefined, [], {}), undefined);
});

test('login rejects conflicting key selection before credential lookup', () => {
  assert.throws(
    () => validateInvocation('login', undefined, [], { key: true, 'new-key': true }),
    (error) => error.code === 'invalid_usage' && /either --key or --new-key/.test(error.message),
  );
});
