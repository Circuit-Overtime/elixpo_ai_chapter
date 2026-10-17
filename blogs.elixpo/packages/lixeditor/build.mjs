import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';

const src = resolve('src');
const dist = resolve('dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const shared = {
  bundle: true,
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  target: 'es2020',
  platform: 'browser',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@blocknote/core',
    '@blocknote/react',
    '@blocknote/mantine',
    'katex',
    'mermaid',
    'shiki',
  ],
  minify: true,
  treeShaking: true,
  legalComments: 'none',
};

// Build ESM
await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/index.js',
  ...shared,
  banner: { js: '"use client";' },
});

// Build CJS
await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'cjs',
  outfile: 'dist/index.cjs',
  ...shared,
});

// Minify each stylesheet without bundling its imports. This preserves every
// granular styles/* export while allowing the consumer's bundler to reuse the
// KaTeX dependency and its fonts instead of publishing a duplicate font set.
const styleRoot = join(src, 'styles');
const styleEntries = readdirSync(styleRoot)
  .filter((entry) => entry.endsWith('.css'))
  .map((entry) => join(styleRoot, entry));
await build({
  entryPoints: styleEntries,
  bundle: false,
  outdir: join(dist, 'styles'),
  minify: true,
  legalComments: 'none',
});

console.log('✓ Built minified ESM, CJS, and dependency-aware CSS to dist/');
