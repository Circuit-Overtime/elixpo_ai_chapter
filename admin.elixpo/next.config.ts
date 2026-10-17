import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    // MUI v7's prebuilt ESM has a circular-init hazard that surfaces during
    // Next 15's page-data collection. Re-transpiling through Next's webpack
    // pipeline resolves the eval order. (Same fix as accounts/payouts.elixpo.)
    transpilePackages: [
        "@mui/material",
        "@mui/system",
        "@mui/icons-material",
        "@mui/utils",
        "@mui/private-theming",
        "@mui/styled-engine",
    ],
    // Rewrite barrel imports to deep paths so we never load the MUI barrel
    // module (the source of the circular init crash above).
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
};

export default nextConfig;
