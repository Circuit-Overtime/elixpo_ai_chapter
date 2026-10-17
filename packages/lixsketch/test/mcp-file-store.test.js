import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileSceneStore } from '../src/mcp/fileStore.js';
import { applyScenePatch } from '../src/mcp/scene.js';

test('file scene store creates and atomically replaces a private scene file', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lixsketch-mcp-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'canvas.lixjson');
  const store = new FileSceneStore(filePath);

  const initial = await store.read();
  const changed = applyScenePatch(initial, [
    { op: 'add', shape: { type: 'circle', shapeID: 'stored-circle', x: 80, y: 80, rx: 40, ry: 40 } },
  ]).scene;
  await store.write(changed);

  const stored = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(stored.mcpRevision, 1);
  assert.equal(stored.shapes[0].shapeID, 'stored-circle');
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
});
