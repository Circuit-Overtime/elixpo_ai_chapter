import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { qrRequiresLogin, QR_STYLES } from '../src/qr.js';
import { runSkills } from '../src/skills.js';

test('basic QR styles stay local while paid features require login', () => {
  assert.equal(qrRequiresLogin({ style: 'classic' }), false);
  assert.equal(qrRequiresLogin({ style: 'rounded' }), false);
  assert.equal(qrRequiresLogin({ style: 'aurora' }), true);
  assert.equal(qrRequiresLogin({ track: true }), true);
  assert.deepEqual(QR_STYLES, ['classic', 'rounded', 'dots', 'classy', 'aurora', 'inverse', 'sunset', 'forest']);
});

test('bundled skills install from the npm package', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'lixrl-skills-'));
  await runSkills('install', ['lixrl-links'], { target, quiet: true });
  const content = await readFile(path.join(target, 'lixrl-links', 'SKILL.md'), 'utf8');
  assert.match(content, /name: lixrl-links/);
  assert.match(content, /lixrl urls list/);
});
