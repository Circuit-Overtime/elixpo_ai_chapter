import test from 'node:test';
import assert from 'node:assert/strict';
import { readUploadRequest } from '../lib/mediaUploadRequest.js';

test('reads durable JSON image uploads without multipart parsing', async () => {
  const request = new Request('https://blogs.elixpo.com/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: 'AQID',
      mimeType: 'image/webp',
      type: 'cover',
      blogId: 'acirznth',
      uploadId: 'upload-1',
    }),
  });

  const upload = await readUploadRequest(request);
  assert.equal(upload.transport, 'json');
  assert.equal(upload.mediaType, 'cover');
  assert.equal(upload.blogId, 'acirznth');
  assert.equal(upload.requestedUploadId, 'upload-1');
  assert.equal(upload.file.type, 'image/webp');
  assert.equal(upload.file.size, 3);
  assert.deepEqual([...new Uint8Array(await upload.file.arrayBuffer())], [1, 2, 3]);
});

test('keeps multipart uploads compatible for existing callers', async () => {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array([1, 2])], { type: 'image/png' }), 'avatar.png');
  formData.append('type', 'avatar');
  const request = new Request('https://blogs.elixpo.com/api/media/upload', { method: 'POST', body: formData });

  const upload = await readUploadRequest(request);
  assert.equal(upload.transport, 'multipart');
  assert.equal(upload.mediaType, 'avatar');
  assert.equal(upload.file.type, 'image/png');
  assert.equal(upload.file.size, 2);
});

test('rejects malformed JSON image bodies', async () => {
  const request = new Request('https://blogs.elixpo.com/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'not base64!', mimeType: 'image/webp' }),
  });

  await assert.rejects(() => readUploadRequest(request), /Invalid base64 image body/);
});

test('rejects base64 with bad length using the same error', async () => {
  const request = new Request('https://blogs.elixpo.com/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'abcde', mimeType: 'image/webp' }),
  });

  await assert.rejects(() => readUploadRequest(request), /Invalid base64 image body/);
});
