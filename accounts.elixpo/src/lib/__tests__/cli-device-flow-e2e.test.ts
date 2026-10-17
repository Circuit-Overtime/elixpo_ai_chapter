/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env } from "cloudflare:test";
import type { D1Database } from "@cloudflare/workers-types";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getDiscovery } from "../../../app/.well-known/oauth-authorization-server/route";
import { POST as approveDevice } from "../../../app/api/auth/device/approve/route";
import { POST as issueDevice } from "../../../app/api/auth/device/authorize/route";
import { POST as denyDevice } from "../../../app/api/auth/device/deny/route";
import { POST as revokeToken } from "../../../app/api/auth/revoke/route";
import { POST as exchangeToken } from "../../../app/api/auth/token/route";
import { createAccessToken, verifyJWT } from "../jwt";
import { deriveS256CodeChallenge } from "../pkce";

vi.mock("@/lib/d1-client", async () => {
    const { env: testEnv } = await import("cloudflare:test");
    return { getDatabase: async () => testEnv.DB };
});

declare global {
    namespace Cloudflare {
        interface Env {
            DB: D1Database;
        }
    }
}

const CLIENT_ID = "lixblogs-cli-prod";
const USER_ID = "cli-e2e-user";
const USER_EMAIL = "cli-e2e@example.com";
const AUDIENCE = "blogs.elixpo.com";
const OLD_AUDIENCE = "api.lixblogs.com";
const SCOPES = "openid profile email lixblogs:blog:read";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const REDIRECT_URI = "https://cli.example.com/callback";

type DeviceResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
};

type TokenResponse = {
    access_token: string;
    refresh_token: string;
    scope: string;
};

function jsonRequest(url: string, body: unknown, cookie?: string) {
    return new NextRequest(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
    });
}

function formRequest(url: string, body: Record<string, string>) {
    return new NextRequest(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
    });
}

async function setupDatabase() {
    await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
            display_name TEXT, email_verified INTEGER DEFAULT 1
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS identities (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
            provider_user_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS oauth_clients (
            client_id TEXT PRIMARY KEY, client_secret_hash TEXT NOT NULL,
            name TEXT NOT NULL, redirect_uris TEXT NOT NULL, scopes TEXT NOT NULL,
            is_active INTEGER DEFAULT 1, owner_id TEXT, client_type TEXT NOT NULL,
            audience TEXT, homepage_url TEXT,
            custom_scopes TEXT NOT NULL DEFAULT '[]',
            is_branding_verified INTEGER NOT NULL DEFAULT 0
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS device_authorizations (
            id TEXT PRIMARY KEY, device_code_hash TEXT UNIQUE NOT NULL,
            user_code_hash TEXT UNIQUE NOT NULL, client_id TEXT NOT NULL,
            audience TEXT, scopes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
            user_id TEXT, interval_seconds INTEGER NOT NULL DEFAULT 5,
            last_polled_at DATETIME, poll_count INTEGER NOT NULL DEFAULT 0,
            ip_address TEXT, expires_at DATETIME NOT NULL, approved_at DATETIME,
            denied_at DATETIME, exchanged_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
            client_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL, revoked INTEGER DEFAULT 0,
            revoked_at DATETIME, ip_hash TEXT, ua_short TEXT,
            last_used_at DATETIME, family_id TEXT, parent_token_hash TEXT UNIQUE,
            sid TEXT, revoked_reason TEXT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY, user_id TEXT, event_type TEXT NOT NULL,
            provider TEXT, ip_address TEXT, user_agent TEXT, status TEXT,
            error_message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
            id TEXT PRIMARY KEY, ip_address TEXT NOT NULL, endpoint TEXT NOT NULL,
            attempt_count INTEGER DEFAULT 1, first_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP, window_reset_at DATETIME NOT NULL,
            is_blocked INTEGER DEFAULT 0, blocked_until DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ip_address, endpoint)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_requests (
            id TEXT PRIMARY KEY, state TEXT UNIQUE NOT NULL, nonce TEXT NOT NULL,
            pkce_verifier TEXT NOT NULL, provider TEXT NOT NULL,
            client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, scopes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL, code TEXT, user_id TEXT,
            used INTEGER DEFAULT 0, code_challenge TEXT,
            code_challenge_method TEXT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_usage_seen (
            client_id TEXT NOT NULL, user_id TEXT NOT NULL,
            year_month TEXT NOT NULL,
            PRIMARY KEY (client_id, user_id, year_month)
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_usage_monthly (
            client_id TEXT NOT NULL, year_month TEXT NOT NULL,
            mau_count INTEGER NOT NULL DEFAULT 0,
            last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (client_id, year_month)
        )`),
        env.DB.prepare("DELETE FROM audit_logs"),
        env.DB.prepare("DELETE FROM refresh_tokens"),
        env.DB.prepare("DELETE FROM device_authorizations"),
        env.DB.prepare("DELETE FROM rate_limits"),
        env.DB.prepare("DELETE FROM auth_requests"),
        env.DB.prepare("DELETE FROM app_usage_seen"),
        env.DB.prepare("DELETE FROM app_usage_monthly"),
        env.DB.prepare("DELETE FROM identities"),
        env.DB.prepare("DELETE FROM oauth_clients"),
        env.DB.prepare("DELETE FROM users"),
    ]);

    await env.DB.batch([
        env.DB.prepare(
            "INSERT INTO users (id, email, display_name, email_verified) VALUES (?, ?, ?, 1)",
        ).bind(USER_ID, USER_EMAIL, "CLI E2E User"),
        env.DB.prepare(
            "INSERT INTO identities (id, user_id, provider, provider_user_id) VALUES (?, ?, 'email', ?)",
        ).bind("cli-e2e-identity", USER_ID, USER_EMAIL),
        env.DB.prepare(
            `INSERT INTO oauth_clients
             (client_id, client_secret_hash, name, redirect_uris, scopes,
              is_active, owner_id, client_type, audience)
             VALUES (?, ?, ?, ?, ?, 1, ?, 'public', ?)`,
        ).bind(
            CLIENT_ID,
            "unused-public-client-secret",
            "LixBlogs CLI (Prod)",
            JSON.stringify([REDIRECT_URI]),
            JSON.stringify(SCOPES.split(" ")),
            USER_ID,
            AUDIENCE,
        ),
    ]);
}

async function issue(): Promise<DeviceResponse> {
    const response = await issueDevice(
        jsonRequest("https://accounts.test/api/auth/device/authorize", {
            client_id: CLIENT_ID,
            scope: SCOPES,
            audience: AUDIENCE,
        }),
    );
    expect(response.status).toBe(200);
    return response.json<DeviceResponse>();
}

async function userCookie() {
    const token = await createAccessToken(USER_ID, USER_EMAIL, "email");
    return `access_token=${token}`;
}

async function poll(deviceCode: string) {
    return exchangeToken(
        formRequest("https://accounts.test/api/auth/token", {
            grant_type: DEVICE_GRANT,
            device_code: deviceCode,
            client_id: CLIENT_ID,
        }),
    );
}

async function approve(userCode: string) {
    return approveDevice(
        jsonRequest(
            "https://accounts.test/api/auth/device/approve",
            { user_code: userCode },
            await userCookie(),
        ),
    );
}

describe("LixBlogs CLI device-flow contract", () => {
    beforeAll(async () => {
        const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
            extractable: true,
        });
        process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
        process.env.JWT_PUBLIC_KEY = await exportSPKI(publicKey);
        process.env.NEXT_PUBLIC_APP_URL = "https://accounts.test";
        process.env.JWT_EXPIRATION_MINUTES = "15";
        process.env.REFRESH_TOKEN_EXPIRATION_DAYS = "30";
    });

    beforeEach(setupDatabase);

    it("covers pending, slow-down, browser approval, refresh rotation, and replay revocation", async () => {
        const device = await issue();
        expect(device.verification_uri_complete).toContain(device.user_code);

        const pending = await poll(device.device_code);
        expect(pending.status).toBe(400);
        expect(await pending.json()).toMatchObject({
            error: "authorization_pending",
        });

        const tooFast = await poll(device.device_code);
        expect(tooFast.status).toBe(400);
        expect(await tooFast.json()).toMatchObject({ error: "slow_down" });

        expect((await approve(device.user_code)).status).toBe(200);
        const exchanged = await poll(device.device_code);
        expect(exchanged.status).toBe(200);
        const firstTokens = await exchanged.json<TokenResponse>();
        expect(firstTokens.scope).toBe(SCOPES);
        expect((await verifyJWT(firstTokens.access_token))?.aud).toBe(AUDIENCE);

        const rotated = await exchangeToken(
            formRequest("https://accounts.test/api/auth/token", {
                grant_type: "refresh_token",
                refresh_token: firstTokens.refresh_token,
                client_id: CLIENT_ID,
            }),
        );
        expect(rotated.status).toBe(200);
        const rotatedTokens = await rotated.json<TokenResponse>();
        expect((await verifyJWT(rotatedTokens.access_token))?.aud).toBe(
            AUDIENCE,
        );

        const replay = await exchangeToken(
            formRequest("https://accounts.test/api/auth/token", {
                grant_type: "refresh_token",
                refresh_token: firstTokens.refresh_token,
                client_id: CLIENT_ID,
            }),
        );
        expect(replay.status).toBe(400);
        expect(await replay.json()).toMatchObject({ error: "invalid_grant" });

        const active = await env.DB.prepare(
            "SELECT COUNT(*) AS count FROM refresh_tokens WHERE revoked = 0",
        ).first<{ count: number }>();
        expect(active?.count).toBe(0);
        const audit = await env.DB.prepare(
            "SELECT event_type FROM audit_logs WHERE event_type = 'refresh_token_reuse_detected'",
        ).first<{ event_type: string }>();
        expect(audit?.event_type).toBe("refresh_token_reuse_detected");
    });

    it("rejects the obsolete production resource audience", async () => {
        const response = await issueDevice(
            jsonRequest("https://accounts.test/api/auth/device/authorize", {
                client_id: CLIENT_ID,
                scope: SCOPES,
                audience: OLD_AUDIENCE,
            }),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: "invalid_request",
        });
    });

    it("binds a public authorization code to S256 PKCE and issues an ID token", async () => {
        const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        await env.DB.prepare(
            `INSERT INTO auth_requests
             (id, state, nonce, pkce_verifier, provider, client_id,
              redirect_uri, scopes, expires_at, code, user_id, used,
              code_challenge, code_challenge_method)
             VALUES (?, ?, ?, ?, 'sso', ?, ?, ?, datetime('now', '+10 minutes'),
                     ?, ?, 0, ?, 'S256')`,
        )
            .bind(
                "pkce-request",
                "pkce-state",
                "pkce-nonce",
                "legacy-unused-verifier",
                CLIENT_ID,
                REDIRECT_URI,
                SCOPES,
                "code_pkce",
                USER_ID,
                await deriveS256CodeChallenge(verifier),
            )
            .run();

        const rejected = await exchangeToken(
            formRequest("https://accounts.test/api/auth/token", {
                grant_type: "authorization_code",
                code: "code_pkce",
                code_verifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            }),
        );
        expect(rejected.status).toBe(400);
        expect(await rejected.json()).toMatchObject({ error: "invalid_grant" });

        const accepted = await exchangeToken(
            formRequest("https://accounts.test/api/auth/token", {
                grant_type: "authorization_code",
                code: "code_pkce",
                code_verifier: verifier,
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            }),
        );
        expect(accepted.status).toBe(200);
        const tokens = (await accepted.json()) as TokenResponse & {
            id_token: string;
        };
        expect((await verifyJWT(tokens.id_token))?.type).toBe("id");
        expect((await verifyJWT(tokens.id_token))?.aud).toBe(CLIENT_ID);
    });

    it("covers denial and expiry responses", async () => {
        const deniedDevice = await issue();
        const denied = await denyDevice(
            jsonRequest(
                "https://accounts.test/api/auth/device/deny",
                { user_code: deniedDevice.user_code },
                await userCookie(),
            ),
        );
        expect(denied.status).toBe(200);
        const deniedPoll = await poll(deniedDevice.device_code);
        expect(await deniedPoll.json()).toMatchObject({
            error: "access_denied",
        });

        const expiredDevice = await issue();
        await env.DB.prepare(
            "UPDATE device_authorizations SET expires_at = datetime('now', '-1 minute') WHERE device_code_hash IS NOT NULL AND status = 'pending'",
        ).run();
        const expiredPoll = await poll(expiredDevice.device_code);
        expect(await expiredPoll.json()).toMatchObject({
            error: "expired_token",
        });
    });

    it("makes revoke idempotent and prevents further refresh", async () => {
        const device = await issue();
        expect((await approve(device.user_code)).status).toBe(200);
        const tokens = await (
            await poll(device.device_code)
        ).json<TokenResponse>();

        const revokeBody = {
            token: tokens.refresh_token,
            client_id: CLIENT_ID,
        };
        expect(
            (
                await revokeToken(
                    formRequest(
                        "https://accounts.test/api/auth/revoke",
                        revokeBody,
                    ),
                )
            ).status,
        ).toBe(200);
        expect(
            (
                await revokeToken(
                    formRequest(
                        "https://accounts.test/api/auth/revoke",
                        revokeBody,
                    ),
                )
            ).status,
        ).toBe(200);

        const refresh = await exchangeToken(
            formRequest("https://accounts.test/api/auth/token", {
                grant_type: "refresh_token",
                refresh_token: tokens.refresh_token,
                client_id: CLIENT_ID,
            }),
        );
        expect(refresh.status).toBe(400);
        expect(await refresh.json()).toMatchObject({ error: "invalid_grant" });
    });

    it("publishes the compatibility and lifecycle discovery contract", async () => {
        const response = await getDiscovery();
        const metadata = (await response.json()) as {
            device_authorization_endpoint: string;
            grant_types_supported: string[];
        };
        expect(metadata).toMatchObject({
            elixpo_contract_version: "1.1.0",
            elixpo_min_compatible_cli_version: "0.1.0",
            elixpo_refresh_token_rotation: {
                policy: "rotate_always",
                reuse_action: "revoke_family",
            },
        });
        expect(metadata.grant_types_supported).toContain(DEVICE_GRANT);
        expect(metadata.device_authorization_endpoint).toContain(
            "/api/auth/device/authorize",
        );
        expect(metadata).toMatchObject({
            jwks_uri: "https://accounts.test/.well-known/jwks.json",
            userinfo_endpoint: "https://accounts.test/api/auth/me",
            code_challenge_methods_supported: ["S256"],
            id_token_signing_alg_values_supported: ["EdDSA"],
        });
    });
});
