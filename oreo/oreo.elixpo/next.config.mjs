/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — Cloudflare Pages serves the resulting /out directory
  // as a plain CDN-fronted site. Keeps the deployment story to two
  // commands (`next build` + `wrangler pages deploy out`) and lets us
  // skip the Workers runtime entirely. The cost is no server-rendered
  // routes; the file-transfer page does its work entirely client-side
  // against the badge's local HTTP server, so that's fine.
  output: "export",
  // Image optimisation requires a server runtime — disable so the
  // static export contains the original asset bytes.
  images: {
    unoptimized: true,
  },
  // Trailing slashes on every URL so Cloudflare Pages serves the
  // matching `path/index.html` even without rewrite rules.
  trailingSlash: true,
};

export default nextConfig;
