import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runDomains, runKeys, runUrls } from '../src/commands.js';

function recorder(result = { success: true }) {
  const calls = [];
  return {
    calls,
    client: { request: async (...args) => { calls.push(args); return result; } },
  };
}

test('URL creation maps CLI flags to the production API schema', async () => {
  const { client, calls } = recorder({ short_code: 'launch' });
  await runUrls(client, 'create', ['https://example.com'], {
    quiet: true, slug: 'launch', title: 'Launch', campaign: 'summer', tag: ['news'], 'utm-source': 'cli',
  });
  assert.deepEqual(calls[0], ['/api/urls', { method: 'POST', body: {
    url: 'https://example.com', custom_code: 'launch', title: 'Launch', campaign: 'summer', tags: ['news'], utm: { source: 'cli' },
  } }]);
});

test('destructive operations require explicit confirmation', async () => {
  const { client } = recorder();
  await assert.rejects(() => runUrls(client, 'delete', ['abc123'], { quiet: true }), /--yes/);
  await assert.rejects(() => runKeys(client, 'revoke', ['1'], { quiet: true }), /--yes/);
  await assert.rejects(() => runDomains(client, 'remove', ['1'], { quiet: true }), /--yes/);
});

test('bulk creation accepts a top-level JSON array', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lixrl-bulk-'));
  const file = path.join(root, 'links.json');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(file, JSON.stringify([{ url: 'https://example.com' }])));
  const { client, calls } = recorder();
  await runUrls(client, 'bulk-create', [], { quiet: true, file });
  assert.deepEqual(calls[0][1].body.links, [{ url: 'https://example.com' }]);
  assert.match(await readFile(file, 'utf8'), /example/);
});
