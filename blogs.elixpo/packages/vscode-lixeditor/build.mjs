import { build } from 'esbuild';

const watch = process.argv.includes('--watch');

// Build the extension (Node.js, CommonJS)
await build({
  entryPoints: ['src/extension.js'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'out/extension.js',
  external: ['vscode'],
  minify: !watch,
  sourcemap: watch,
  ...(watch ? { watch: { onRebuild: () => console.log('[ext] Rebuilt') } } : {}),
});

console.log('✓ Extension built → out/extension.js');

// Build the webview (Browser, ESM → IIFE)
await build({
  entryPoints: ['webview/editor-src.jsx'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: 'webview/editor.js',
  jsx: 'automatic',
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
    '.woff': 'dataurl',
    '.woff2': 'dataurl',
    '.ttf': 'dataurl',
    '.eot': 'dataurl',
    '.svg': 'dataurl',
    '.css': 'css',
  },
  conditions: ['style', 'browser', 'import'],
  target: 'es2020',
  minify: !watch,
  sourcemap: watch,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  ...(watch ? { watch: { onRebuild: () => console.log('[webview] Rebuilt') } } : {}),
});

console.log('✓ Webview built → webview/editor.js');

// CSS is bundled by esbuild from webview/styles.css → webview/editor.css

console.log(watch ? '👀 Watching for changes...' : '🎉 Build complete!');
