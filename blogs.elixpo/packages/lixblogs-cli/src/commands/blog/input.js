import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { markdownToBlocks } from '../../content/markdown.js';

async function stdinText(stream) {
  let value = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) value += chunk;
  return value;
}

async function editText(initial = '', editor = process.env.EDITOR || process.env.VISUAL) {
  if (!editor) throw new Error('$EDITOR or $VISUAL must be set when using --editor.');
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'lixblogs-'));
  const filename = path.join(directory, 'post.md');
  await fs.writeFile(filename, initial, { mode: 0o600 });
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(editor, [filename], { stdio: 'inherit', shell: true });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Editor exited with code ${code}.`)));
    });
    return await fs.readFile(filename, 'utf8');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export async function resolveMarkdownInput(options, { stdin = process.stdin, initial = '' } = {}) {
  const selected = [options.file !== undefined, options.stdin, options.content !== undefined, options.editor]
    .filter(Boolean).length;
  if (selected > 1) throw new Error('Use only one of --file, --stdin, --content, or --editor.');
  if (!selected) return null;
  let markdown;
  if (options.file !== undefined) markdown = await fs.readFile(path.resolve(options.file), 'utf8');
  else if (options.stdin) markdown = await stdinText(stdin);
  else if (options.content !== undefined) markdown = options.content;
  else markdown = await editText(initial);
  return { markdown, blocks: markdownToBlocks(markdown) };
}

export function metadataFromOptions(options) {
  const input = {};
  const mappings = {
    title: 'title', subtitle: 'subtitle', slug: 'slug', emoji: 'emoji',
    publication: 'publishedAs', collection: 'collectionId', cover: 'coverUrl',
    license: 'license',
  };
  for (const [option, field] of Object.entries(mappings)) {
    if (options[option] !== undefined) input[field] = options[option];
  }
  if (options.tag !== undefined) input.tags = options.tag;
  if (options['member-only']) input.memberOnly = true;
  if (options['no-member-only']) input.memberOnly = false;
  if (options.secret) input.secret = true;
  if (options['not-secret']) input.secret = false;
  if (options['allow-comments']) input.allowComments = true;
  if (options['no-comments']) input.allowComments = false;
  if (options['cover-x'] !== undefined || options['cover-y'] !== undefined) {
    input.coverPosition = { x: Number(options['cover-x'] ?? 50), y: Number(options['cover-y'] ?? 50) };
  }
  if (options['cover-zoom'] !== undefined) input.coverZoom = Number(options['cover-zoom']);
  return input;
}
