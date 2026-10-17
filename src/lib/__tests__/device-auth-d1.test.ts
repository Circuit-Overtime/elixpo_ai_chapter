/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env } from "cloudflare:test";
import type { D1Database } from "@cloudflare/workers-types";
import { beforeEach, describe, expect, it } from "vitest";
import {
    cleanupExpiredDeviceAuthorizations,
    createDeviceAuthorization,
    lookupDeviceAuthorizationByUserCode,
    normalizeUserCode,
} from "../device-auth-service";
import { createDeviceIssuanceRateLimiter } from "../rate-limit";
import { hashString } from "../webcrypto";

declare global {
    namespace Cloudflare {
        interface Env {
            DB: D1Database;
        }
    }
}

const PUBLIC_CLIENT_ID = "cli_public_test";

async function setupDatabase() {
    await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS oauth_clients (
            client_id TEXT PRIMARY KEY,
            client_type TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            scopes TEXT NOT NULL,
            name TEXT NOT NULL,
            audience TEXT,
            custom_scopes TEXT NOT NULL DEFAULT '[]',
            logo_url TEXT,
            branding_display_name TEXT,
            branding_primary_color TEXT,
            branding_accent_color TEXT,
            privacy_policy_url TEXT,
            terms_of_service_url TEXT,
            is_branding_verified INTEGER DEFAULT 0,
            branding_verified_domain TEXT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS device_authorizations (
            id TEXT PRIMARY KEY,
            device_code_hash TEXT UNIQUE NOT NULL,
            user_code_hash TEXT UNIQUE NOT NULL,
            client_id TEXT NOT NULL,
            audience TEXT,
            scopes TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            user_id TEXT,
            interval_seconds INTEGER NOT NULL DEFAULT 5,
            last_polled_at DATETIME,
            poll_count INTEGER NOT NULL DEFAULT 0,
            ip_address TEXT,
            expires_at DATETIME NOT NULL,
            approved_at DATETIME,
            denied_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
            id TEXT PRIMARY KEY,
            ip_address TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            attempt_count INTEGER DEFAULT 1,
            first_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            window_reset_at DATETIME NOT NULL,
            is_blocked INTEGER DEFAULT 0,
            blocked_until DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ip_address, endpoint)
        )`),
        env.DB.prepare("DELETE FROM device_authorizations"),
        env.DB.prepare("DELETE FROM oauth_clients"),
        env.DB.prepare("DELETE FROM rate_limits"),
    ]);
}

async function insertClient(
    clientId = PUBLIC_CLIENT_ID,
    options: {
        type?: "public" | "confidential";
        active?: boolean;
        audience?: string;
        scopes?: string[];
        customScopes?: Array<{
            name: string;
            label: string;
            description: string;
        }>;
    } = {},
) {
    await env.DB.prepare(
        `INSERT INTO oauth_clients (client_id, client_type, is_active, scopes, name, audience, custom_scopes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            clientId,
            options.type || "public",
            options.active === false ? 0 : 1,
            JSON.stringify(options.scopes || ["openid", "lixblogs:blog:read"]),
            "LixBlogs CLI",
            options.audience ?? null,
            JSON.stringify(options.customScopes || []),
        )
        .run();
}

describe("device authorization with D1", () => {
    beforeEach(setupDatabase);

    it("issues codes for a registered public client and stores only hashes", async () => {
        await insertClient();

        const result = await createDeviceAuthorization(env.DB, {
            clientId: PUBLIC_CLIENT_ID,
            scope: "openid lixblogs:blog:read",
            ipAddress: "203.0.113.10",
            appUrl: "https://accounts.elixpo.com",
        });
        const row = await env.DB.prepare(
            `SELECT device_code_hash, user_code_hash, scopes, status
             FROM device_authorizations WHERE client_id = ?`,
        )
            .bind(PUBLIC_CLIENT_ID)
            .first<{
                device_code_hash: string;
                user_code_hash: string;
                scopes: string;
                status: string;
            }>();

        expect(result).toMatchObject({
            verification_uri: "https://accounts.elixpo.com/device",
            expires_in: 600,
            interval: 2,
        });
        expect(row?.device_code_hash).toBe(
            await hashString(result.device_code),
        );
        expect(row?.user_code_hash).toBe(
            await hashString(normalizeUserCode(result.user_code)),
        );
        expect(row?.device_code_hash).not.toContain(result.device_code);
        expect(row?.user_code_hash).not.toContain(result.user_code);
        expect(row?.scopes).toBe("openid lixblogs:blog:read");
        expect(row?.status).toBe("pending");
    });

    it("returns the same stable error for missing, inactive, and confidential clients", async () => {
        await insertClient("cli_inactive", { active: false });
        await insertClient("cli_confidential", { type: "confidential" });
        const input = {
            scope: "openid",
            ipAddress: "203.0.113.10",
            appUrl: "https://accounts.elixpo.com",
        };

        for (const clientId of [
            "cli_missing",
            "cli_inactive",
            "cli_confidential",
        ]) {
            await expect(
                createDeviceAuthorization(env.DB, { ...input, clientId }),
            ).rejects.toMatchObject({
                code: "invalid_client",
                message: "Unknown or ineligible client",
            });
        }
    });

    it("rejects scopes that are not registered to the public client", async () => {
        await insertClient();

        await expect(
            createDeviceAuthorization(env.DB, {
                clientId: PUBLIC_CLIENT_ID,
                scope: "lixblogs:blog:delete",
                ipAddress: "203.0.113.10",
                appUrl: "https://accounts.elixpo.com",
            }),
        ).rejects.toMatchObject({ code: "invalid_scope" });
    });

    it("issues the Lixrl bootstrap scope for its registered audience", async () => {
        await insertClient("lixrl-cli-prod", {
            audience: "lixrl.com",
            scopes: ["openid", "profile", "email", "lixrl:keys:create"],
        });

        await expect(
            createDeviceAuthorization(env.DB, {
                clientId: "lixrl-cli-prod",
                audience: "lixrl.com",
                scope: "openid profile email lixrl:keys:create",
                ipAddress: "203.0.113.10",
                appUrl: "https://accounts.elixpo.com",
            }),
        ).resolves.toMatchObject({ interval: 2 });
    });

    it("binds a creator-defined scope only to its owning client", async () => {
        await insertClient("custom-device-client", {
            scopes: ["openid", "acme:documents:read"],
            customScopes: [
                {
                    name: "acme:documents:read",
                    label: "Read documents",
                    description: "View documents stored in Acme.",
                },
            ],
        });

        await expect(
            createDeviceAuthorization(env.DB, {
                clientId: "custom-device-client",
                scope: "openid acme:documents:read",
                ipAddress: "203.0.113.10",
                appUrl: "https://accounts.elixpo.com",
            }),
        ).resolves.toMatchObject({ interval: 2 });

        await insertClient("other-device-client", {
            scopes: ["openid", "acme:documents:read"],
        });
        await expect(
            createDeviceAuthorization(env.DB, {
                clientId: "other-device-client",
                scope: "acme:documents:read",
                ipAddress: "203.0.113.11",
                appUrl: "https://accounts.elixpo.com",
            }),
        ).rejects.toMatchObject({ code: "invalid_scope" });
    });

    it("stores only the client's registered audience", async () => {
        await insertClient(PUBLIC_CLIENT_ID, {
            audience: "blogs.elixpo.com",
        });

        await createDeviceAuthorization(env.DB, {
            clientId: PUBLIC_CLIENT_ID,
            audience: "blogs.elixpo.com",
            ipAddress: "203.0.113.10",
            appUrl: "https://accounts.elixpo.com",
        });
        const row = await env.DB.prepare(
            "SELECT audience FROM device_authorizations WHERE client_id = ?",
        )
            .bind(PUBLIC_CLIENT_ID)
            .first<{ audience: string }>();
        expect(row?.audience).toBe("blogs.elixpo.com");
    });

    it("rejects an audience not registered to the client", async () => {
        await insertClient(PUBLIC_CLIENT_ID, {
            audience: "blogs.elixpo.com",
        });

        await expect(
            createDeviceAuthorization(env.DB, {
                clientId: PUBLIC_CLIENT_ID,
                audience: "attacker.example",
                ipAddress: "203.0.113.10",
                appUrl: "https://accounts.elixpo.com",
            }),
        ).rejects.toMatchObject({ code: "invalid_request" });
    });

    it("treats every authorization status as expired after its deadline", async () => {
        await insertClient();
        const rawUserCode = "ABCD-EFGH";
        await env.DB.prepare(
            `INSERT INTO device_authorizations
             (id, device_code_hash, user_code_hash, client_id, scopes, status, expires_at)
             VALUES (?, ?, ?, ?, ?, 'approved', ?)`,
        )
            .bind(
                "expired-approved",
                await hashString("dvc_expired"),
                await hashString(normalizeUserCode(rawUserCode)),
                PUBLIC_CLIENT_ID,
                "openid",
                "2020-01-01T00:00:00.000Z",
            )
            .run();

        await expect(
            lookupDeviceAuthorizationByUserCode(env.DB, rawUserCode),
        ).resolves.toMatchObject({ status: "expired" });
    });

    it("cleans expired grants in bounded batches regardless of status", async () => {
        await insertClient();
        for (const [index, status] of [
            "pending",
            "approved",
            "denied",
        ].entries()) {
            await env.DB.prepare(
                `INSERT INTO device_authorizations
                 (id, device_code_hash, user_code_hash, client_id, scopes, status, expires_at)
                 VALUES (?, ?, ?, ?, 'openid', ?, ?)`,
            )
                .bind(
                    `expired-${index}`,
                    `device-${index}`,
                    `user-${index}`,
                    PUBLIC_CLIENT_ID,
                    status,
                    "2020-01-01T00:00:00.000Z",
                )
                .run();
        }
        await env.DB.prepare(
            `INSERT INTO device_authorizations
             (id, device_code_hash, user_code_hash, client_id, scopes, expires_at)
             VALUES ('future', 'device-future', 'user-future', ?, 'openid', ?)`,
        )
            .bind(PUBLIC_CLIENT_ID, "2099-01-01T00:00:00.000Z")
            .run();

        await expect(
            cleanupExpiredDeviceAuthorizations(env.DB, 2),
        ).resolves.toBe(2);
        await expect(
            cleanupExpiredDeviceAuthorizations(env.DB, 2),
        ).resolves.toBe(1);
        const remaining = await env.DB.prepare(
            "SELECT id FROM device_authorizations",
        ).all<{ id: string }>();
        expect(remaining.results).toEqual([{ id: "future" }]);
    });

    it("blocks issuance after the configured per-IP allowance", async () => {
        const limiter = createDeviceIssuanceRateLimiter();
        for (let attempt = 0; attempt < 10; attempt++) {
            await expect(
                limiter.check(env.DB, "203.0.113.10", "device_issue"),
            ).resolves.toMatchObject({ allowed: true });
        }
        await expect(
            limiter.check(env.DB, "203.0.113.10", "device_issue"),
        ).resolves.toMatchObject({ allowed: false, remaining: 0 });
    });
});
