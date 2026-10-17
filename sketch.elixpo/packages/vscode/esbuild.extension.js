const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/extension.js')],
    bundle: true,
    format: 'cjs',
    outfile: path.resolve(__dirname, 'out/extension.js'),
    platform: 'node',
    target: 'node18',
    external: ['vscode'],
    minify: false,
    sourcemap: true,
}).then(() => {
    console.log('[esbuild] Extension built -> out/extension.js');
}).catch((err) => {
    console.error('[esbuild] Build failed:', err);
    process.exit(1);
});
