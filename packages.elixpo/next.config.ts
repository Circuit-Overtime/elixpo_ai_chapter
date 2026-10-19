import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "elixpo.com" },
      { protocol: "https", hostname: "crumb.elixpo.com" },
    ],
  },
};

export default nextConfig;
