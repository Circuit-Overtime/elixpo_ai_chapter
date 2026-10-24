// Post a blog to LixBlogs from the CLI (no editor needed).
//
// Usage:
//   node scripts/post-blog.mjs --author <username> --title "My Title" --file post.md [options]
//
// Options:
//   --author <username>     (required) whose account to post under
//   --title  "..."          (required) blog title
//   --file   <path.md>       markdown/plain-text body (or --body "...")
//   --body   "..."           inline body (alternative to --file)
//   --subtitle "..."         optional subtitle
//   --emoji  "🚀"            optional page emoji
//   --tags   "DevOps,MLOps"  optional comma-separated tags
//   --org    <org-slug>      publish under an org (sets published_as = org:<id>)
//   --status draft|published|unlisted   (default: published)
//   --remote                 target REMOTE D1 (default: local)
//
// Examples:
//   node scripts/post-blog.mjs --author subhrokolay2 --title "Hello" --body "..."
//   node scripts/post-blog.mjs --author ayushman --title "CI/CD" --file ci.md --tags "DevOps,CI/CD" --remote
//   node scripts/post-blog.mjs --author ayushman --title "Team note" --file n.md --org dscjisu

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compressBlogContent } from '../lib/compress.js';

const DB = 'lixblogs';

// ---- arg parsing ----
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const name = k.slice(2);
    if (name === 'remote') { a.remote = true; continue; }
    a[name] = argv[++i];
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));

if (!args.author || !args.title || (!args.file && !args.body)) {
  console.error('Required: --author <username> --title "..." and --file <path> or --body "..."');
  console.error('Run with no content for full usage in the file header.');
  process.exit(1);
}

const target = args.remote ? '--remote' : '--local';

// ---- wrangler helpers ----
function d1Query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB, target, '--json', '--command', sql], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  return parsed[0]?.results || [];
}
function d1Exec(sqlFile) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', DB, target, '--file', sqlFile], { stdio: 'inherit' });
}

const esc = (s) => String(s).replace(/'/g, "''"); // SQL single-quote escape

// ---- markdown → BlockNote blocks (paragraph / heading / list) ----
function blockId() { return crypto.randomUUID().replace(/-/g, '').slice(0, 12); }
function textContent(text) { return text ? [{ type: 'text', text, styles: {} }] : []; }
function baseProps(extra = {}) { return { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', ...extra }; }

function mdToBlocks(md) {
  const blocks = [];
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      blocks.push({ id: blockId(), type: 'heading', props: baseProps({ level: m[1].length }), content: textContent(m[2]), children: [] });
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      blocks.push({ id: blockId(), type: 'bulletListItem', props: baseProps(), content: textContent(m[1]), children: [] });
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      blocks.push({ id: blockId(), type: 'numberedListItem', props: baseProps(), content: textContent(m[1]), children: [] });
    } else if ((m = line.match(/^>\s+(.*)$/))) {
      blocks.push({ id: blockId(), type: 'quote', props: baseProps(), content: textContent(m[1]), children: [] });
    } else {
      blocks.push({ id: blockId(), type: 'paragraph', props: baseProps(), content: textContent(line), children: [] });
    }
  }
  if (blocks.length === 0) blocks.push({ id: blockId(), type: 'paragraph', props: baseProps(), content: [], children: [] });
  return blocks;
}

function countWords(blocks) {
  let n = 0;
  for (const b of blocks) for (const c of (b.content || [])) if (c.type === 'text') n += (c.text || '').trim().split(/\s+/).filter(Boolean).length;
  return n;
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

// ---- main ----
const body = args.body || fs.readFileSync(args.file, 'utf8');
const blocks = mdToBlocks(body);
const words = countWords(blocks);
const status = args.status || 'published';

if (status !== 'draft' && words < 20) {
  console.error(`✗ Content has ${words} words — need at least 20 to publish (or use --status draft).`);
  process.exit(1);
}

console.log(`→ Resolving author @${args.author} on ${args.remote ? 'REMOTE' : 'local'} D1...`);
const authorRows = d1Query(`SELECT id, username FROM users WHERE username = '${esc(args.author)}'`);
if (authorRows.length === 0) { console.error(`✗ No user @${args.author}`); process.exit(1); }
const authorId = authorRows[0].id;

let publishedAs = 'personal';
if (args.org) {
  const orgRows = d1Query(`SELECT id, slug FROM orgs WHERE slug = '${esc(args.org)}'`);
  if (orgRows.length === 0) { console.error(`✗ No org with slug '${args.org}'`); process.exit(1); }
  publishedAs = `org:${orgRows[0].id}`;
  console.log(`→ Publishing under org @${args.org}`);
}

const id = blockId();              // blog uuid-ish
const slugid = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
const slug = `${slugify(args.title)}-${slugid.slice(0, 4)}`; // suffix keeps the global-unique slug index happy
const content = compressBlogContent(blocks);
const readTime = Math.max(1, Math.ceil(words / 200));
const tags = (args.tags || '').split(',').map(t => t.trim()).filter(Boolean);

const sql = [
  `INSERT INTO blogs (id, slugid, slug, title, subtitle, page_emoji, content, author_id, published_as, status, read_time_minutes, published_at) VALUES (` +
    `'${esc(id)}','${esc(slugid)}','${esc(slug)}','${esc(args.title)}','${esc(args.subtitle || '')}','${esc(args.emoji || '')}','${esc(content)}','${esc(authorId)}','${esc(publishedAs)}','${esc(status)}',${readTime}, unixepoch());`,
  ...tags.map(t => `INSERT OR IGNORE INTO blog_tags (blog_id, tag) VALUES ('${esc(id)}','${esc(t)}');`),
].join('\n');

const tmp = `/tmp/post-blog-${slugid}.sql`;
fs.writeFileSync(tmp, sql);
console.log(`→ Inserting "${args.title}" (${words} words, ${tags.length} tags)...`);
d1Exec(tmp);
fs.unlinkSync(tmp);

const url = args.org ? `/${args.org}/${slug}` : `/${args.author}/${slug}`;
console.log(`✓ Posted (${status}). URL path: ${url}  · slugid: ${slugid}`);
