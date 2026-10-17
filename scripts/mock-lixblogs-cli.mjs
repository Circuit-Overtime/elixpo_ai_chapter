#!/usr/bin/env node
/**
 * Mock LixBlogs CLI — simulates the device authorization flow (RFC 8628)
 * against a local accounts.elixpo instance, standing in for the real
 * LixBlogs CLI (elixpo/blogs.elixpo#135) which hasn't shipped yet.
 *
 * Usage:
 *   node scripts/mock-lixblogs-cli.mjs
 *
 * Requires the dev server running locally (npm run dev -> http://localhost:3000)
 */

const BASE_URL = process.env.ACCOUNTS_BASE_URL || "http://localhost:3000";
const CLIENT_ID = process.env.CLIENT_ID || "lixblogs-cli-dev";
const SCOPES = [
    "openid",
    "profile",
    "email",
    "lixblogs:profile:read",
    "lixblogs:blog:read",
    "lixblogs:integrations:cloudinary:read",
    "lixblogs:integrations:cloudinary:disconnect",
];

function log(label, data) {
    console.log(`\n[${label}]`);
    if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

async function requestDeviceCode() {
    const res = await fetch(`${BASE_URL}/api/auth/device/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            scope: SCOPES.join(" "),
        }),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(
            `device/authorize failed: ${res.status} ${JSON.stringify(data)}`,
        );
    }
    return data;
}

async function pollToken(deviceCode, intervalSeconds) {
    let interval = intervalSeconds || 5;

    while (true) {
        await sleep(interval * 1000);

        const res = await fetch(`${BASE_URL}/api/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: deviceCode,
                client_id: CLIENT_ID,
            }),
        });

        const data = await res.json();

        if (res.ok) {
            return data;
        }

        switch (data.error) {
            case "authorization_pending":
                console.log("… waiting for approval");
                continue;
            case "slow_down":
                interval += 5;
                console.log(`slow_down received — backing off to ${interval}s`);
                continue;
            case "access_denied":
                throw new Error("Authorization was denied by the user.");
            case "expired_token":
                throw new Error("Device code expired before approval.");
            default:
                throw new Error(`Unexpected error: ${JSON.stringify(data)}`);
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    console.log("LixBlogs CLI (mock) — device login\n");

    const device = await requestDeviceCode();
    log("device/authorize response", device);

    console.log("\n=================================");
    console.log(`  Open: ${device.verification_uri}`);
    console.log(`  Enter code: ${device.user_code}`);
    console.log("=================================\n");
    console.log("Waiting for you to approve in the browser…");

    const tokens = await pollToken(device.device_code, device.interval);
    log("token response (redacted)", {
        token_type: tokens.token_type,
        scope: tokens.scope,
        expires_in: tokens.expires_in,
        access_token: tokens.access_token ? "[redacted]" : undefined,
        refresh_token: tokens.refresh_token ? "[redacted]" : undefined,
    });

    console.log("\n✅ Device login flow completed successfully.");
}

main().catch((err) => {
    console.error("\n❌ Mock CLI flow failed:", err.message);
    process.exit(1);
});
