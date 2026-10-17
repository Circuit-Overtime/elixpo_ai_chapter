import assert from 'node:assert/strict';
import test from 'node:test';
import { colorEnabled, failureBlock, loginChallenge, parseLoginChoice, statusLine, withSpinner } from '../src/ui.js';

test('device login displays the prefilled verification URL without requiring color', () => {
  const output = loginChallenge({
    url: 'https://accounts.elixpo.com/device?user_code=LIXR-L123',
    code: 'LIXR-L123',
    expiresInSeconds: 600,
    profile: 'default',
    interactive: true,
  });
  assert.match(output, /device\?user_code=LIXR-L123/);
  assert.match(output, /Press Enter to open here/);
  assert.match(output, /No localhost callback or exposed port is required/);
  assert.doesNotMatch(output, /\u001b\[/);
});

test('NO_COLOR disables terminal styling', () => {
  assert.equal(colorEnabled({ isTTY: true }, { NO_COLOR: '1', TERM: 'xterm' }), false);
  assert.equal(colorEnabled({ isTTY: true }, { TERM: 'xterm' }), true);
});

test('login choice accepts new-key defaults and existing-key aliases', () => {
  assert.equal(parseLoginChoice(''), 'new');
  assert.equal(parseLoginChoice('1'), 'new');
  assert.equal(parseLoginChoice('create'), 'new');
  assert.equal(parseLoginChoice('2'), 'existing');
  assert.equal(parseLoginChoice('paste'), 'existing');
  assert.equal(parseLoginChoice('invalid'), null);
});

test('terminal statuses use distinct symbols and colors', () => {
  assert.match(statusLine('success', 'Created', true), /✓.*Created/);
  assert.match(statusLine('info', 'Loading', true), /→.*Loading/);
  assert.match(statusLine('warning', 'Check input', true), /!.*Check input/);
  assert.match(statusLine('error', 'Failed', true), /✘.*Failed/);
  assert.notEqual(statusLine('success', 'Created', true), statusLine('error', 'Created', true));
  assert.doesNotMatch(statusLine('success', 'Created', false), /\u001b\[/);
});

test('correctable input failures render as warnings', () => {
  const output = failureBlock({ code: 'invalid_usage', message: 'Missing --file.' }, true);
  assert.match(output, /!.*Missing --file/);
  assert.doesNotMatch(output, /✘/);
});

test('spinner is visible only while an interactive task is pending', async () => {
  let output = '';
  const stream = { isTTY: true, write: (value) => { output += value; } };
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const task = withSpinner('Loading links', () => pending, {
    stream,
    env: { TERM: 'xterm' },
    intervalMs: 10_000,
  });
  assert.match(output, /Loading links/);
  release('done');
  assert.equal(await task, 'done');
  assert.match(output, /\u001b\[2K/);
});

test('spinner stays silent for JSON and non-TTY output', async () => {
  let output = '';
  const stream = { isTTY: true, write: (value) => { output += value; } };
  assert.equal(await withSpinner('Loading', async () => 42, { stream, json: true }), 42);
  assert.equal(output, '');

  const piped = { isTTY: false, write: (value) => { output += value; } };
  assert.equal(await withSpinner('Loading', async () => 43, { stream: piped }), 43);
  assert.equal(output, '');
});

test('spinner clears its line when an asynchronous task fails', async () => {
  let output = '';
  const stream = { isTTY: true, write: (value) => { output += value; } };
  await assert.rejects(
    () => withSpinner('Loading', async () => { throw new Error('failed'); }, {
      stream,
      env: { NO_COLOR: '1', TERM: 'xterm' },
      intervalMs: 10_000,
    }),
    /failed/,
  );
  assert.match(output, /Loading/);
  assert.match(output, /\u001b\[2K/);
});

test('key-limit errors include a concrete recovery path', () => {
  const output = failureBlock({
    code: 'api_key_limit_reached',
    message: 'API key limit reached (1 for free tier)',
    details: {
      limit: 1,
      tier: 'free',
      manage_url: 'https://lixrl.com/profile/keys',
      retry_command: 'lixrl login --open',
    },
  });
  assert.match(output, /free plan allows 1 active API key/);
  assert.match(output, /profile\/keys/);
  assert.match(output, /lixrl login --open/);
  assert.doesNotMatch(output, /\u001b\[/);
});
