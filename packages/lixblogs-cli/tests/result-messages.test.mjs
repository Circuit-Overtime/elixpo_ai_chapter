import test from 'node:test';
import assert from 'node:assert/strict';
import { blogMutationMessage, mediaMutationMessage } from '../src/cli/resultMessages.js';

test('blog mutation messages show status and canonical URL', () => {
  assert.equal(
    blogMutationMessage('edit', {
      status: 'draft',
      url: 'https://blogs.elixpo.com/author/post',
    }),
    'Blog updated [draft] https://blogs.elixpo.com/author/post',
  );
});

test('media mutation messages never expose media URLs', () => {
  const result = {
    blog: { id: 'blog-1' },
    media: { url: 'https://res.cloudinary.com/private-path' },
    output: '/tmp/image.jpg',
  };

  assert.equal(
    mediaMutationMessage('generate', result, 'blog-1'),
    'Image generated and attached to blog blog-1.',
  );
  assert.doesNotMatch(mediaMutationMessage('generate', result, 'blog-1'), /cloudinary|\/tmp/);
});
