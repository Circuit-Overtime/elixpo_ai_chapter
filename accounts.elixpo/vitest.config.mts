import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": new URL("./src", import.meta.url).pathname,
        },
    },
    plugins: [
        cloudflareTest({
            wrangler: { configPath: "./wrangler.toml" },
        }),
    ],
    test: {
        include: [
            "src/**/__tests__/**/*.test.ts",
            "packages/accounts/src/**/__tests__/**/*.test.ts",
        ],
        setupFiles: ["src/lib/__tests__/setup.ts"],
    },
});
