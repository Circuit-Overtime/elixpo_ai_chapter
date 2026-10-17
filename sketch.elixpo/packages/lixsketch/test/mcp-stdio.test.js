import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createLixSketchMcpServer } from '../src/mcp/server.js';
import { MemorySceneStore } from '../src/mcp/store.js';
import { createEmptyScene } from '../src/mcp/scene.js';
import { serveLixSketchStdio } from '../src/mcp/stdioTransport.js';

test('stdio server negotiates MCP and persists a patch', { timeout: 5000 }, async () => {
  const store = new MemorySceneStore(createEmptyScene());
  const server = createLixSketchMcpServer({ store, templateProvider: { search: async () => [], load: async () => { throw new Error('unused'); } } });
  const input = new PassThrough(), output = new PassThrough();
  const transport = serveLixSketchStdio(server, { input, output });
  let rawOutput = '';
  output.on('data', (chunk) => { rawOutput += chunk.toString(); });

  input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })}\n`);
  input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'canvas_apply_patch', arguments: { expectedRevision: 0, operations: [{ op: 'add', shape: { type: 'rectangle', shapeID: 'box', x: 10, y: 20, width: 100, height: 50 } }] } } })}\n`);
  await transport.closed;

  const responses = rawOutput.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(responses.find((response) => response.id === 1).result.protocolVersion, '2025-11-25');
  assert.equal(responses.find((response) => response.id === 2).result.structuredContent.revision, 1);
  const saved = await store.read();
  assert.equal(saved.shapes[0].shapeID, 'box');
});
