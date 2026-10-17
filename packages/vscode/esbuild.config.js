const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
    entryPoints: [path.resolve(__dirname, '../lixsketch/src/index.js')],
    bundle: true,
    format: 'iife',
    globalName: 'LixSketch',
    outfile: path.resolve(__dirname, 'media/engine.bundle.js'),
    platform: 'browser',
    target: 'es2020',
    minify: false,
    sourcemap: true,
    define: {
        'process.env.NODE_ENV': '"production"',
    },
}).then(() => {
    console.log('[esbuild] Engine bundle built -> media/engine.bundle.js');
}).catch((err) => {
    console.error('[esbuild] Build failed:', err);
    process.exit(1);
});
