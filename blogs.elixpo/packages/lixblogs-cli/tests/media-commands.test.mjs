import test from 'node:test';
import assert from 'node:assert/strict';
import { BlogApiError } from '../src/api/BlogClient.js';
import { attachMediaToBlog } from '../src/commands/media/index.js';

test('media attachment rebases once a concurrent blog edit changes the revision', async () => {
  const updates = [];
  let reads = 0;
  const blogClient = {
    async get() {
      reads += 1;
      return {
        etag: reads === 1 ? '"old"' : '"current"',
        content: reads === 1 ? [] : [{ id: 'server-edit', type: 'paragraph', content: [] }],
      };
    },
    async update(id, input, options) {
      updates.push({ id, input, options });
      if (updates.length === 1) throw new BlogApiError('revision_conflict', 'Changed', { status: 412 });
      return { id, etag: '"attached"' };
    },
  };

  const result = await attachMediaToBlog({
    blogClient,
    blogId: 'blog-1',
    media: { id: 'media-1', url: 'https://media.example/image.webp' },
    type: 'inline',
    caption: 'Diagram',
  });

  assert.equal(result.etag, '"attached"');
  assert.equal(reads, 2);
  assert.equal(updates[1].options.etag, '"current"');
  assert.equal(updates[1].input.content[0].id, 'server-edit');
  assert.equal(updates[1].input.content[1].props._mediaId, 'media-1');
});
