import assert from 'node:assert/strict';
import test from 'node:test';
import { compileLixScript } from '../src/mcp/lixscript.js';
import { RemoteSceneStore, decryptRemoteScene, encryptRemoteScene } from '../src/mcp/remoteStore.js';
import { applyScenePatch, createEmptyScene, validateScene } from '../src/mcp/scene.js';
import { createLixSketchMcpServer } from '../src/mcp/server.js';
import { MemorySceneStore } from '../src/mcp/store.js';

function workspaceKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('base64url');
}

test('LixScript compiles into an auto-framed atomic scene patch', () => {
  const compiled = compileLixScript(`
rect api at 100, 80 size 180x70 {
  fill: #2f2442
  label: "API"
}
circle db at api.right + 140, 80 size 80x80 {
  label: "DB"
}
arrow request from api.right to db.left
  `, { x: 20, y: 30 });
  const result = applyScenePatch(createEmptyScene(), compiled.operations);
  assert.equal(validateScene(result.scene).valid, true);
  const frame = result.scene.shapes.find((shape) => shape.type === 'frame');
  assert.ok(frame);
  assert.ok(frame.containedShapeIDs.length >= 5);
  assert.ok(result.scene.shapes.every((shape) => shape === frame || shape.parentFrame === frame.shapeID));
});

test('lixscript_apply uses dry-run without mutating the store', async () => {
  const store = new MemorySceneStore(createEmptyScene());
  const server = createLixSketchMcpServer({ store, templateProvider: { search: async () => [], load: async () => null } });
  const result = await server.callTool('lixscript_apply', { source: 'rect box at 10, 10 size 120x60', dryRun: true, expectedRevision: 0 });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.dryRun, true);
  assert.equal((await store.read()).shapes.length, 0);
});

test('remote store decrypts reads and encrypts revision-checked writes', async () => {
  const key = workspaceKey();
  const remoteScene = createEmptyScene('Remote');
  const encryptedData = await encryptRemoteScene(remoteScene, key);
  let writtenBody;
  const fetchImpl = async (_url, options = {}) => {
    assert.equal(options.headers.Authorization, 'Bearer lixmcp_test-token-value');
    if (!options.method) return new Response(JSON.stringify({ encryptedData, revision: 3 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    writtenBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ saved: true, revision: 4 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const store = new RemoteSceneStore({ baseUrl: 'https://example.test', workspaceId: 'lx-remote', token: 'lixmcp_test-token-value', encryptionKey: key, fetchImpl });
  const scene = await store.read();
  assert.equal(scene.mcpRevision, 3);
  const changed = applyScenePatch(scene, [{ op: 'add', shape: { type: 'circle', x: 50, y: 50, rx: 20, ry: 20 } }]).scene;
  const saved = await store.write(changed);
  assert.equal(writtenBody.expectedRevision, 3);
  assert.equal(saved.mcpRevision, 4);
  const decrypted = await decryptRemoteScene(writtenBody.encryptedData, key);
  assert.equal(decrypted.shapes.length, 1);
});

test('remote store surfaces revision conflicts', async () => {
  const key = workspaceKey();
  const encryptedData = await encryptRemoteScene(createEmptyScene(), key);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ encryptedData, revision: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ error: 'REVISION_CONFLICT', expectedRevision: 2, currentRevision: 3 }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  };
  const store = new RemoteSceneStore({ baseUrl: 'https://example.test', workspaceId: 'lx-remote', token: 'lixmcp_test-token-value', encryptionKey: key, fetchImpl });
  const scene = await store.read();
  await assert.rejects(() => store.write(scene), /Revision conflict: expected 2, current 3/);
});
