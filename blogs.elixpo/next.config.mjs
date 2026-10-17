import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/docs/editor-overview', destination: '/docs/lixeditor#editor-overview', permanent: true },
      { source: '/docs/installation', destination: '/docs/lixeditor#installation', permanent: true },
      { source: '/docs/quick-start', destination: '/docs/lixeditor#quick-start', permanent: true },
      { source: '/docs/props', destination: '/docs/lixeditor#props', permanent: true },
      { source: '/docs/imperative-api', destination: '/docs/lixeditor#imperative-api', permanent: true },
      { source: '/docs/block-model', destination: '/docs/lixeditor#block-model', permanent: true },
      { source: '/docs/markdown-shortcuts', destination: '/docs/lixeditor#markdown-shortcuts', permanent: true },
      { source: '/docs/rendering', destination: '/docs/lixeditor#rendering', permanent: true },
    ];
  },
};

if (process.env.NODE_ENV === 'development') {
  const { existsSync } = await import('node:fs');
  if (existsSync('.dev.vars')) {
    throw new Error(
      'Remove .dev.vars before starting local development; .env.local is the authoritative local secret file.',
    );
  }

  const { config } = await import('dotenv');
  const localEnv = config({ path: '.env.local', override: true, quiet: true });

  if (localEnv.error) {
    throw new Error(
      'Local development requires .env.local. Copy the local secret template or request the development secrets before starting Next.js.',
      { cause: localEnv.error },
    );
  }

  // setupDevPlatform uses Wrangler's platform proxy for D1/KV. Forward the
  // already-loaded .env.local values so Cloudflare bindings and process.env
  // see the same local configuration. A .dev.vars file must not be present,
  // because Wrangler gives it precedence over dotenv files.
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'true';
  await setupDevPlatform();
}

export default nextConfig;
