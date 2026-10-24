import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaClient } from '../src/api/MediaClient.js';

test('generate sends one caller-owned idempotency identifier and returns bytes', async () => {
  const calls = [];
  const http = {
    requireScopes: async (scopes) => assert.deepEqual(scopes, ['lixblogs:media:write']),
    requestRaw: async (path, options) => {
      calls.push({ path, options });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    },
  };
  const result = await new MediaClient(http).generate({ prompt: 'diagram', generationId: 'generation_test_123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/v1/media/generate');
  assert.equal(JSON.parse(calls[0].options.body).generationId, 'generation_test_123');
  assert.equal(result.mimeType, 'image/png');
  assert.deepEqual([...result.bytes], [1, 2, 3]);
});

test('upload preserves supported MIME types and storage idempotency id', async () => {
  let request;
  const http = {
    requireScopes: async () => {},
    requestRaw: async (path, options) => {
      request = { path, options };
      return Response.json({ id: 'media-1', url: 'https://res.cloudinary.com/example/image.webp' });
    },
  };
  const result = await new MediaClient(http).upload({
    bytes: new Uint8Array([1]), mimeType: 'image/avif', blogId: 'blog-1', uploadId: 'upload-1',
  });
  assert.equal(request.path, '/api/v1/media/upload');
  assert.equal(request.options.body.get('uploadId'), 'upload-1');
  assert.equal(request.options.body.get('blogId'), 'blog-1');
  assert.equal(request.options.body.get('file').type, 'image/avif');
  assert.equal(result.id, 'media-1');
});

test('media deletion requires the write scope and parses the v1 envelope', async () => {
  const http = {
    requireScopes: async (scopes) => assert.deepEqual(scopes, ['lixblogs:media:write']),
    request: async (path, options) => {
      assert.equal(path, '/api/v1/media/media-1');
      assert.equal(options.method, 'DELETE');
      return Response.json({ data: { id: 'media-1', deleted: true } });
    },
  };
  assert.deepEqual(await new MediaClient(http).delete('media-1'), { id: 'media-1', deleted: true });
});
