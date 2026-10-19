import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "github.com",
        pathname: "/*.png",
      },
      {
        protocol: "https",
        hostname: "packages.elixpo.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "crumb.elixpo.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/elixpo/packages.elixpo/**",
      },
    ],
  },
};

export default nextConfig;
