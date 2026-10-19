import test from 'node:test';
import assert from 'node:assert/strict';
import { indexNowPayload, publicDiscoveryUrls } from '../lib/searchDiscovery.js';

test('search discovery accepts only canonical LixBlogs HTTPS URLs', () => {
  assert.deepEqual(publicDiscoveryUrls([
    '/writer/story',
    'https://blogs.elixpo.com/writer/story',
    'http://blogs.elixpo.com/insecure',
    'https://example.com/not-ours',
    'not a url',
  ]), ['https://blogs.elixpo.com/writer/story']);
});

test('IndexNow payload points to the public root key', () => {
  const payload = indexNowPayload('/writer/story');
  assert.equal(payload.host, 'blogs.elixpo.com');
  assert.equal(payload.keyLocation, `https://blogs.elixpo.com/${payload.key}.txt`);
  assert.deepEqual(payload.urlList, ['https://blogs.elixpo.com/writer/story']);
});
