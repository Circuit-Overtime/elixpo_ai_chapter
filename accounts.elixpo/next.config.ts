import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // MUI v7's prebuilt ESM has a circular-init hazard that surfaces during
    // Next 15's page-data collection (TypeError: unstable_createUseMediaQuery
    // is not a function). Re-transpiling through Next's webpack pipeline
    // resolves the eval order.
    transpilePackages: [
        "@mui/material",
        "@mui/system",
        "@mui/icons-material",
        "@mui/utils",
        "@mui/private-theming",
        "@mui/styled-engine",
    ],
    // Rewrite `import { Box } from "@mui/material"` to
    // `import Box from "@mui/material/Box"` so we never load the barrel
    // module. The barrel is what triggers the circular init that crashes
    // page-data collection with "unstable_createUseMediaQuery is not a function".
    modularizeImports: {
        "@mui/material": {
            transform: "@mui/material/{{member}}",
        },
        "@mui/icons-material": {
            transform: "@mui/icons-material/{{member}}",
        },
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    webpack: (config, { isServer }) => {
        // Prevent webpack from trying to bundle nodemailer (Node.js-only)
        // into edge runtime chunks. It's dynamically imported at runtime only
        // in local dev (next dev) as a fallback when cloudflare:sockets is unavailable.
        if (isServer) {
            config.externals = config.externals || [];
            config.externals.push("nodemailer");
        }
        return config;
    },
};

// Wire up the Cloudflare Pages dev shim so getRequestContext().env
// (KV, D1) works under `next dev`. Without this, any route that calls
// getRequestContext() throws "Failed to retrieve the Cloudflare request
// context" — production via next-on-pages has the binding plumbed
// automatically, dev needs this explicit call.
if (process.env.NODE_ENV === "development") {
    const { setupDevPlatform } = require("@cloudflare/next-on-pages/next-dev");
    setupDevPlatform();
}

export default nextConfig;
