import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_SITEMAP_CACHE_KEY } from '../lib/cache.js';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the public sitemap uses the shared invalidation key and only lists indexable blogs', async () => {
  const sitemap = await source('app/sitemap.js');

  assert.equal(PUBLIC_SITEMAP_CACHE_KEY, 'v2:public-sitemap-rows');
  assert.match(sitemap, /kvCache\(PUBLIC_SITEMAP_CACHE_KEY, 300,/);
  assert.match(sitemap, /b\.status = 'published' AND b\.secret = 0/);
});

test('blog lifecycle invalidation also refreshes crawler discovery', async () => {
  const lifecycle = await source('lib/api/v1/blogCache.js');
  const webPublish = await source('app/api/blogs/publish/route.js');
  const webDelete = await source('app/api/blogs/[slugid]/route.js');

  assert.match(lifecycle, /PUBLIC_SITEMAP_CACHE_KEY/);
  assert.match(webPublish, /invalidateBlogLifecycleCaches\(slugid\)/);
  assert.match(webDelete, /invalidateBlogLifecycleCaches\(slugid\)/);
});
