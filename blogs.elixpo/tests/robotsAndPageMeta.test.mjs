import test from 'node:test';
import assert from 'node:assert/strict';
import robots from '../app/robots.js';
import { staticPageMeta } from '../lib/pageMeta.js';

test('robots blocks the API but keeps OG card images crawlable', () => {
  const { rules, sitemap } = robots();
  assert.ok(rules.disallow.includes('/api/'));
  // Social crawlers honor robots.txt; without this allow, link previews break.
  assert.ok(rules.allow.includes('/api/og'));
  assert.equal(sitemap, 'https://blogs.elixpo.com/sitemap.xml');
});

test('static page cards point at the page, not the homepage', () => {
  const meta = staticPageMeta({ title: 'Pricing', description: 'Plans.', path: '/pricing' });
  assert.equal(meta.alternates.canonical, 'https://blogs.elixpo.com/pricing');
  assert.equal(meta.openGraph.url, 'https://blogs.elixpo.com/pricing');
  assert.equal(meta.openGraph.title, 'Pricing | LixBlogs');
  assert.equal(meta.twitter.title, 'Pricing | LixBlogs');
});

test('static page meta passes through extra fields like robots', () => {
  const meta = staticPageMeta({ title: 'Contests', description: 'd', path: '/contests', robots: { index: true } });
  assert.deepEqual(meta.robots, { index: true });
});
