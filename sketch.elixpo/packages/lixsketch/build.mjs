import { build } from 'esbuild';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';

const src = resolve('src');
const dist = resolve('dist');

if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'react'), { recursive: true });
mkdirSync(join(dist, 'mcp'), { recursive: true });

// roughjs / perfect-freehand are listed as runtime deps so consumers
// pull them via npm. react / react-dom are peer deps. We keep them
// external in the bundle so each consumer gets a single React copy.
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'roughjs',
  'roughjs/bin/rough.js',
  'roughjs/bundled/rough.esm.js',
  'perfect-freehand',
  'zustand',
  'zustand/middleware',
];
await build({
  entryPoints: ['src/react/index.js'],
  bundle: true,
  format: 'esm',
  outdir: 'dist/react',
  splitting: true,
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  target: 'es2020',
  platform: 'browser',
  external: EXTERNAL,
  minify: false,
  sourcemap: true,
  treeShaking: true,
  banner: { js: '"use client";' },
});

// Runtime-neutral MCP factory for browser, Worker, and custom hosts.
await build({
  entryPoints: [join(src, 'mcp', 'index.js')],
  bundle: true,
  format: 'esm',
  outfile: join(dist, 'mcp', 'index.js'),
  target: 'es2022',
  platform: 'neutral',
  minify: false,
  sourcemap: true,
});

// Node-only MCP utilities and executable. Keeping these separate prevents
// node:fs/readline imports from entering browser or Cloudflare bundles.
await build({
  entryPoints: [join(src, 'mcp', 'node.js')],
  bundle: true,
  format: 'esm',
  outfile: join(dist, 'mcp', 'node.js'),
  target: 'node20',
  platform: 'node',
  minify: false,
  sourcemap: true,
});

await build({
  entryPoints: [join(src, 'mcp', 'stdio.js')],
  bundle: true,
  format: 'esm',
  outfile: join(dist, 'mcp', 'stdio.js'),
  target: 'node20',
  platform: 'node',
  minify: false,
  sourcemap: true,
});

// ── Bundle the React subpath's CSS into a single file ─────────────────
// Consumer does `import '@elixpo/lixsketch/react/styles'`.
await build({
  entryPoints: [join(src, 'react', 'styles.css')],
  bundle: true,
  outfile: join(dist, 'react', 'styles.css'),
  loader: {
    '.css': 'css',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file',
    '.otf': 'file',
    '.svg': 'file',
    '.png': 'file',
    '.jpg': 'file',
    '.gif': 'file',
  },
  minify: false,
});

console.log('✓ Built React and MCP package subpaths.');
