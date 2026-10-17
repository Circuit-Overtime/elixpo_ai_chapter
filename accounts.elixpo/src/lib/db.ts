/**
 * Database utilities for D1
 * Import this in API routes to interact with the D1 database
 */

import type { D1Database } from "@cloudflare/workers-types";

export async function createUser(
    db: D1Database,
    {
        id,
        email,
        passwordHash,
        displayName,
    }: {
        id: string;
        email: string;
        passwordHash?: string;
        displayName?: string;
    },
) {
    const stmt = db.prepare(
        "INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET updated_at = CURRENT_TIMESTAMP",
    );
    return await stmt
        .bind(id, email, passwordHash || null, displayName || null)
        .run();
}

export async function getUserById(db: D1Database, userId: string) {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    return await stmt.bind(userId).first();
}

// ── Username (handle) helpers ──
// Usernames are stored lowercase (canonical) so uniqueness is case-insensitive.

export async function getUserByUsername(db: D1Database, username: string) {
    const stmt = db.prepare(
        "SELECT * FROM users WHERE username = ? AND is_active = 1",
    );
    return await stmt.bind(username.toLowerCase()).first();
}

export async function isUsernameTaken(
    db: D1Database,
    username: string,
): Promise<boolean> {
    const row = await db
        .prepare("SELECT 1 FROM users WHERE username = ? LIMIT 1")
        .bind(username.toLowerCase())
        .first();
    return !!row;
}

// Sets the handle, bumps the change counter, and stamps the change time.
// The user `id` is never touched — only the handle changes.
export async function setUsername(
    db: D1Database,
    userId: string,
    username: string,
) {
    return await db
        .prepare(
            `UPDATE users
             SET username = ?,
                 username_changed_at = CURRENT_TIMESTAMP,
                 username_change_count = COALESCE(username_change_count, 0) + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
        )
        .bind(username.toLowerCase(), userId)
        .run();
}

export async function getUserByEmail(db: D1Database, email: string) {
    const stmt = db.prepare(
        "SELECT * FROM users WHERE email = ? AND is_active = 1",
    );
    return await stmt.bind(email).first();
}

export async function getUserByEmailWithPassword(
    db: D1Database,
    email: string,
) {
    const stmt = db.prepare(
        "SELECT id, email, password_hash FROM users WHERE email = ? AND is_active = 1",
    );
    return await stmt.bind(email).first();
}

export async function createIdentity(
    db: D1Database,
    {
        id,
        userId,
        provider,
        providerUserId,
        providerEmail,
        providerProfileUrl,
    }: {
        id: string;
        userId: string;
        provider: string;
        providerUserId: string;
        providerEmail?: string;
        providerProfileUrl?: string;
    },
) {
    const stmt = db.prepare(
        `INSERT INTO identities (id, user_id, provider, provider_user_id, provider_email, provider_profile_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    );
    return await stmt
        .bind(
            id,
            userId,
            provider,
            providerUserId,
            providerEmail || null,
            providerProfileUrl || null,
        )
        .run();
}

export async function getIdentityByProvider(
    db: D1Database,
    provider: string,
    providerUserId: string,
) {
    const stmt = db.prepare(
        "SELECT * FROM identities WHERE provider = ? AND provider_user_id = ?",
    );
    return await stmt.bind(provider, providerUserId).first();
}

export async function getIdentitiesByUserId(db: D1Database, userId: string) {
    const stmt = db.prepare(
        "SELECT * FROM identities WHERE user_id = ? ORDER BY created_at ASC",
    );
    return await stmt.bind(userId).all();
}

export async function createAuthRequest(
    db: D1Database,
    {
        id,
        state,
        nonce,
        pkceVerifier,
        codeChallenge,
        codeChallengeMethod,
        provider,
        clientId,
        redirectUri,
        scopes,
        expiresAt,
    }: {
        id: string;
        state: string;
        nonce: string;
        pkceVerifier: string;
        codeChallenge?: string | null;
        codeChallengeMethod?: "S256" | null;
        provider: string;
        clientId: string;
        redirectUri: string;
        scopes?: string;
        expiresAt: Date;
    },
) {
    const stmt = db.prepare(
        `INSERT INTO auth_requests (id, state, nonce, pkce_verifier, code_challenge, code_challenge_method, provider, client_id, redirect_uri, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    return await stmt
        .bind(
            id,
            state,
            nonce,
            pkceVerifier,
            codeChallenge ?? null,
            codeChallengeMethod ?? null,
            provider,
            clientId,
            redirectUri,
            scopes || null,
            expiresAt.toISOString(),
        )
        .run();
}

export async function getAuthRequestByState(db: D1Database, state: string) {
    const stmt = db.prepare(
        "SELECT * FROM auth_requests WHERE state = ? AND expires_at > CURRENT_TIMESTAMP",
    );
    return await stmt.bind(state).first();
}

export async function deleteAuthRequest(db: D1Database, state: string) {
    const stmt = db.prepare("DELETE FROM auth_requests WHERE state = ?");
    return await stmt.bind(state).run();
}

export async function createRefreshToken(
    db: D1Database,
    {
        id,
        userId,
        tokenHash,
        clientId,
        expiresAt,
        ipHash,
        uaShort,
        familyId,
        parentTokenHash,
        sid,
    }: {
        id: string;
        userId: string;
        tokenHash: string;
        clientId?: string;
        expiresAt: Date;
        ipHash?: string | null;
        uaShort?: string | null;
        familyId?: string | null;
        parentTokenHash?: string | null;
        sid?: string | null;
    },
) {
    const stmt = db.prepare(
        `INSERT INTO refresh_tokens
            (id, user_id, token_hash, client_id, expires_at,
             ip_hash, ua_short, last_used_at, family_id, parent_token_hash, sid)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
    );
    return await stmt
        .bind(
            id,
            userId,
            tokenHash,
            clientId || null,
            expiresAt.toISOString(),
            ipHash ?? null,
            uaShort ?? null,
            familyId ?? null,
            parentTokenHash ?? null,
            sid ?? null,
        )
        .run();
}

export async function hashIpForSession(ip: string): Promise<string | null> {
    if (!ip || ip === "unknown") return null;
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(ip),
    );
    let hex = "";
    for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, "0");
    return hex.slice(0, 32);
}

export function shortUaForSession(ua: string): string | null {
    if (!ua || ua === "unknown") return null;
    let browser = "Unknown browser";
    if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("OPR/")) browser = "Opera";
    else if (ua.includes("Chrome/")) browser = "Chrome";
    else if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Safari/")) browser = "Safari";
    let os = "Unknown OS";
    if (/iPhone|iPad/.test(ua)) os = "iOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Linux/.test(ua)) os = "Linux";
    return `${browser} on ${os}`;
}

export async function getRefreshTokenByHash(db: D1Database, tokenHash: string) {
    const stmt = db.prepare(
        "SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP AND revoked = 0",
    );
    return await stmt.bind(tokenHash).first();
}

export async function getRefreshTokenByHashIncludingRevoked(
    db: D1Database,
    tokenHash: string,
) {
    const stmt = db.prepare(
        "SELECT * FROM refresh_tokens WHERE token_hash = ?",
    );
    return await stmt.bind(tokenHash).first();
}

export async function revokeRefreshToken(
    db: D1Database,
    tokenHash: string,
    reason?: string,
) {
    const stmt = db.prepare(
        "UPDATE refresh_tokens SET revoked = 1, revoked_at = CURRENT_TIMESTAMP, revoked_reason = ? WHERE token_hash = ?",
    );
    return await stmt.bind(reason || null, tokenHash).run();
}

export async function markRefreshTokenRotated(
    db: D1Database,
    tokenHash: string,
    familyId: string,
    sid: string,
) {
    const stmt = db.prepare(
        `UPDATE refresh_tokens
         SET revoked = 1,
             revoked_at = CURRENT_TIMESTAMP,
             revoked_reason = 'rotated',
             family_id = COALESCE(family_id, ?),
             sid = COALESCE(sid, ?)
         WHERE token_hash = ? AND revoked = 0`,
    );
    return await stmt.bind(familyId, sid, tokenHash).run();
}

export async function revokeRefreshTokenFamily(
    db: D1Database,
    familyId: string,
    reason: string,
) {
    const stmt = db.prepare(
        "UPDATE refresh_tokens SET revoked = 1, revoked_at = CURRENT_TIMESTAMP, revoked_reason = ? WHERE family_id = ? AND revoked = 0",
    );
    return await stmt.bind(reason, familyId).run();
}

export async function revokeAllRefreshTokensForUser(
    db: D1Database,
    userId: string,
    reason: string,
) {
    const stmt = db.prepare(
        "UPDATE refresh_tokens SET revoked = 1, revoked_at = CURRENT_TIMESTAMP, revoked_reason = ? WHERE user_id = ? AND revoked = 0",
    );
    return await stmt.bind(reason, userId).run();
}

export async function updateUserLastLogin(db: D1Database, userId: string) {
    const stmt = db.prepare(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
    );
    return await stmt.bind(userId).run();
}

export function deriveSessionContext(request: Request | { headers: Headers }) {
    const headers = request.headers;
    const ipAddress =
        headers.get("cf-connecting-ip") ||
        headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        null;
    const ua = headers.get("user-agent") || "";

    const country = headers.get("cf-ipcountry") || null;
    const city = headers.get("cf-ipcity") || null;
    const region =
        headers.get("cf-region-code") || headers.get("cf-region") || null;

    let browser: string | null = null;
    let browserVersion: string | null = null;
    if (ua.includes("Edg/")) {
        browser = "Edge";
        browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] ?? null;
    } else if (ua.includes("OPR/")) {
        browser = "Opera";
        browserVersion = ua.match(/OPR\/([\d.]+)/)?.[1] ?? null;
    } else if (ua.includes("Firefox/")) {
        browser = "Firefox";
        browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? null;
    } else if (ua.includes("Chrome/")) {
        browser = "Chrome";
        browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? null;
    } else if (ua.includes("Safari/") && ua.includes("Version/")) {
        browser = "Safari";
        browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] ?? null;
    }

    let os: string | null = null;
    let osVersion: string | null = null;
    if (/iPhone|iPad/.test(ua)) {
        os = "iOS";
        osVersion = ua.match(/OS (\d[\d_]*)/)?.[1]?.replace(/_/g, ".") ?? null;
    } else if (/Android/.test(ua)) {
        os = "Android";
        osVersion = ua.match(/Android (\d[\d.]*)/)?.[1] ?? null;
    } else if (/Mac OS X/.test(ua)) {
        os = "macOS";
        osVersion =
            ua.match(/Mac OS X (\d[\d_]*)/)?.[1]?.replace(/_/g, ".") ?? null;
    } else if (/Windows NT/.test(ua)) {
        os = "Windows";
        osVersion = ua.match(/Windows NT ([\d.]+)/)?.[1] ?? null;
    } else if (/Linux/.test(ua)) {
        os = "Linux";
    }

    let deviceType: string | null = null;
    if (/Mobi|Android.*Mobile|iPhone/.test(ua)) deviceType = "mobile";
    else if (/iPad|Tablet/.test(ua)) deviceType = "tablet";
    else if (ua) deviceType = "desktop";

    const locale =
        headers.get("accept-language")?.split(",")[0]?.split(";")[0]?.trim() ||
        null;

    return {
        ipAddress,
        country,
        city,
        region,
        browser,
        browserVersion,
        os,
        osVersion,
        deviceType,
        locale,
    };
}

export async function updateUserSessionContext(
    db: D1Database,
    userId: string,
    ctx: ReturnType<typeof deriveSessionContext>,
): Promise<void> {
    await db
        .prepare(
            `UPDATE users SET
                ip_address       = COALESCE(?, ip_address),
                country          = COALESCE(?, country),
                city             = COALESCE(?, city),
                region           = COALESCE(?, region),
                browser          = COALESCE(?, browser),
                browser_version  = COALESCE(?, browser_version),
                os               = COALESCE(?, os),
                os_version       = COALESCE(?, os_version),
                device_type      = COALESCE(?, device_type),
                locale           = COALESCE(?, locale),
                updated_at       = CURRENT_TIMESTAMP
             WHERE id = ?`,
        )
        .bind(
            ctx.ipAddress,
            ctx.country,
            ctx.city,
            ctx.region,
            ctx.browser,
            ctx.browserVersion,
            ctx.os,
            ctx.osVersion,
            ctx.deviceType,
            ctx.locale,
            userId,
        )
        .run();
}

export async function logAuditEvent(
    db: D1Database,
    {
        id,
        userId,
        eventType,
        provider,
        ipAddress,
        userAgent,
        status,
        errorMessage,
    }: {
        id: string;
        userId?: string;
        eventType: string;
        provider?: string;
        ipAddress?: string;
        userAgent?: string;
        status: "success" | "failure";
        errorMessage?: string;
    },
) {
    const stmt = db.prepare(
        `INSERT INTO audit_logs (id, user_id, event_type, provider, ip_address, user_agent, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    return await stmt
        .bind(
            id,
            userId || null,
            eventType,
            provider || null,
            ipAddress || null,
            userAgent || null,
            status,
            errorMessage || null,
        )
        .run();
}

export async function redactStaleAuditLogs(
    db: D1Database,
    limit: number = 1000,
    retentionDays: number = 90,
) {
    const stmt = db.prepare(`
        UPDATE audit_logs 
        SET ip_address = NULL, user_agent = NULL, error_message = NULL 
        WHERE id IN (
            SELECT id FROM audit_logs 
            WHERE created_at < datetime('now', '-' || ? || ' days')
              AND (ip_address IS NOT NULL OR user_agent IS NOT NULL OR error_message IS NOT NULL)
            LIMIT ?
        )
    `);
    const result = await stmt.bind(retentionDays, limit).run();
    return result.meta?.changes ?? 0;
}

export async function cleanupExpiredOrRevokedRefreshTokens(
    db: D1Database,
    limit: number = 1000,
    revokedRetentionDays: number = 30,
) {
    const stmt = db.prepare(`
        DELETE FROM refresh_tokens 
        WHERE id IN (
            SELECT id FROM refresh_tokens 
            WHERE (expires_at < datetime('now', '-7 days'))
               OR (revoked = 1 AND revoked_at < datetime('now', '-' || ? || ' days'))
            LIMIT ?
        )
    `);
    const result = await stmt.bind(revokedRetentionDays, limit).run();
    return result.meta?.changes ?? 0;
}

/**
 * OAuth Client Management
 * For registering and managing OAuth applications
 */

export async function createOAuthClient(
    db: D1Database,
    {
        clientId,
        clientSecretHash,
        name,
        redirectUris,
        scopes,
        ownerId,
        description,
        homepageUrl,
        logoUrl,
        webhookUrl,
        webhookSecretHash,
        webhookEvents,
        clientType = "confidential",
        audience,
        customScopes = "[]",
    }: {
        clientId: string;
        clientSecretHash: string;
        name: string;
        redirectUris: string; // JSON stringified array
        scopes: string; // JSON stringified array
        ownerId: string;
        description?: string;
        homepageUrl?: string;
        logoUrl?: string;
        webhookUrl?: string | null;
        webhookSecretHash?: string | null;
        webhookEvents?: string | null; // JSON stringified array
        clientType?: "confidential" | "public";
        audience?: string | null;
        customScopes?: string;
    },
) {
    const webhookSecretSetAt =
        webhookUrl && webhookSecretHash ? new Date().toISOString() : null;
    const stmt = db.prepare(
        `INSERT INTO oauth_clients (
            client_id, client_secret_hash, name, redirect_uris, scopes,
            owner_id, description, homepage_url, logo_url,
            webhook_url, webhook_secret_hash, webhook_events, webhook_secret_set_at,
            client_type, audience, custom_scopes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    return await stmt
        .bind(
            clientId,
            clientSecretHash,
            name,
            redirectUris,
            scopes,
            ownerId,
            description ?? null,
            homepageUrl ?? null,
            logoUrl ?? null,
            webhookUrl ?? null,
            webhookSecretHash ?? null,
            webhookEvents ?? null,
            webhookSecretSetAt,
            clientType,
            audience ?? null,
            customScopes,
        )
        .run();
}

export async function getOAuthClientById(db: D1Database, clientId: string) {
    const stmt = db.prepare(
        "SELECT client_id, name, redirect_uris, scopes, custom_scopes, description, homepage_url, created_at, is_active, client_type, audience, logo_url, branding_display_name, branding_primary_color, branding_accent_color, privacy_policy_url, terms_of_service_url, is_branding_verified, branding_verified_domain, branding_verified_at FROM oauth_clients WHERE client_id = ?",
    );
    return await stmt.bind(clientId).first();
}

export async function getOAuthClientByIdWithSecret(
    db: D1Database,
    clientId: string,
) {
    const stmt = db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?");
    return await stmt.bind(clientId).first();
}

export async function validateOAuthClient(
    db: D1Database,
    clientId: string,
    clientSecretHash: string,
): Promise<boolean> {
    const stmt = db.prepare(
        "SELECT 1 FROM oauth_clients WHERE client_id = ? AND client_secret_hash = ? AND is_active = 1",
    );
    const result = await stmt.bind(clientId, clientSecretHash).first();
    return !!result;
}

export async function authenticateOAuthClient(
    db: D1Database,
    clientId: string,
    clientSecretHash?: string | null,
) {
    const stmt = db.prepare(
        "SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1",
    );
    // Explicitly typed as any because we added audience and client_type directly to the schema
    const client = await stmt.bind(clientId).first<any>();

    if (!client) return null;

    if (client.client_type === "public") {
        return client;
    }

    if (!clientSecretHash || client.client_secret_hash !== clientSecretHash) {
        return null;
    }

    return client;
}

export async function updateOAuthClient(
    db: D1Database,
    clientId: string,
    updates: {
        name?: string;
        redirectUris?: string;
        scopes?: string;
        customScopes?: string;
        isActive?: boolean;
        description?: string;
        homepageUrl?: string | null;
        logoUrl?: string | null;
        clientSecretHash?: string;
        brandingDisplayName?: string | null;
        brandingPrimaryColor?: string | null;
        brandingAccentColor?: string | null;
        privacyPolicyUrl?: string | null;
        termsOfServiceUrl?: string | null;
        isBrandingVerified?: boolean;
        brandingVerifiedDomain?: string | null;
        brandingVerifiedAt?: string | null;
        audience?: string | null;
    },
) {
    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.clientSecretHash !== undefined) {
        setClauses.push("client_secret_hash = ?");
        values.push(updates.clientSecretHash);
    }
    if (updates.name !== undefined) {
        setClauses.push("name = ?");
        values.push(updates.name);
    }
    if (updates.redirectUris !== undefined) {
        setClauses.push("redirect_uris = ?");
        values.push(updates.redirectUris);
    }
    if (updates.scopes !== undefined) {
        setClauses.push("scopes = ?");
        values.push(updates.scopes);
    }
    if (updates.customScopes !== undefined) {
        setClauses.push("custom_scopes = ?");
        values.push(updates.customScopes);
    }
    if (updates.audience !== undefined) {
        setClauses.push("audience = ?");
        values.push(updates.audience);
    }
    if (updates.isActive !== undefined) {
        setClauses.push("is_active = ?");
        values.push(updates.isActive ? 1 : 0);
    }
    if (updates.description !== undefined) {
        setClauses.push("description = ?");
        values.push(updates.description);
    }
    if (updates.homepageUrl !== undefined) {
        setClauses.push("homepage_url = ?");
        values.push(updates.homepageUrl);
    }
    if (updates.logoUrl !== undefined) {
        setClauses.push("logo_url = ?");
        values.push(updates.logoUrl);
    }
    if (updates.brandingDisplayName !== undefined) {
        setClauses.push("branding_display_name = ?");
        values.push(updates.brandingDisplayName);
    }
    if (updates.brandingPrimaryColor !== undefined) {
        setClauses.push("branding_primary_color = ?");
        values.push(updates.brandingPrimaryColor);
    }
    if (updates.brandingAccentColor !== undefined) {
        setClauses.push("branding_accent_color = ?");
        values.push(updates.brandingAccentColor);
    }
    if (updates.privacyPolicyUrl !== undefined) {
        setClauses.push("privacy_policy_url = ?");
        values.push(updates.privacyPolicyUrl);
    }
    if (updates.termsOfServiceUrl !== undefined) {
        setClauses.push("terms_of_service_url = ?");
        values.push(updates.termsOfServiceUrl);
    }
    if (updates.isBrandingVerified !== undefined) {
        setClauses.push("is_branding_verified = ?");
        values.push(updates.isBrandingVerified ? 1 : 0);
    }
    if (updates.brandingVerifiedDomain !== undefined) {
        setClauses.push("branding_verified_domain = ?");
        values.push(updates.brandingVerifiedDomain);
    }
    if (updates.brandingVerifiedAt !== undefined) {
        setClauses.push("branding_verified_at = ?");
        values.push(updates.brandingVerifiedAt);
    }

    if (setClauses.length === 0) {
        return null;
    }

    values.push(clientId);

    const stmt = db.prepare(
        `UPDATE oauth_clients SET ${setClauses.join(", ")} WHERE client_id = ?`,
    );
    return await stmt.bind(...(values as (string | number)[])).run();
}

export async function updateOAuthClientWebhook(
    db: D1Database,
    clientId: string,
    ownerId: string,
    patch: {
        webhookUrl?: string | null;
        webhookEvents?: string | null;
    },
): Promise<boolean> {
    const setClauses: string[] = [];
    const values: (string | null)[] = [];
    if ("webhookUrl" in patch) {
        setClauses.push("webhook_url = ?");
        values.push(patch.webhookUrl ?? null);
    }
    if ("webhookEvents" in patch) {
        setClauses.push("webhook_events = ?");
        values.push(patch.webhookEvents ?? null);
    }
    if (setClauses.length === 0) return false;
    values.push(clientId, ownerId);
    const stmt = db.prepare(
        `UPDATE oauth_clients SET ${setClauses.join(", ")} WHERE client_id = ? AND owner_id = ?`,
    );
    const result = await stmt.bind(...values).run();
    return (result.meta?.changes ?? 0) > 0;
}

export async function rotateOAuthClientWebhookSecret(
    db: D1Database,
    clientId: string,
    ownerId: string,
    newSecretHash: string,
): Promise<boolean> {
    const stmt = db.prepare(
        `UPDATE oauth_clients
            SET webhook_secret_hash = ?, webhook_secret_set_at = ?
            WHERE client_id = ? AND owner_id = ? AND webhook_url IS NOT NULL`,
    );
    const result = await stmt
        .bind(newSecretHash, new Date().toISOString(), clientId, ownerId)
        .run();
    return (result.meta?.changes ?? 0) > 0;
}

export interface WebhookEndpointRow {
    id: string;
    client_id: string;
    url: string;
    secret_hash: string;
    events: string;
    is_active: number;
    label: string | null;
    created_at: string;
    secret_set_at: string;
    last_delivery_at: string | null;
    last_status_code: number | null;
    last_error: string | null;
}

export async function listAppWebhookEndpoints(
    db: D1Database,
    clientId: string,
): Promise<WebhookEndpointRow[]> {
    const r = await db
        .prepare(
            `SELECT id, client_id, url, secret_hash, events, is_active, label,
              created_at, secret_set_at, last_delivery_at, last_status_code, last_error
             FROM oauth_client_webhook_endpoints
             WHERE client_id = ?
             ORDER BY created_at ASC`,
        )
        .bind(clientId)
        .all<WebhookEndpointRow>();
    return r.results || [];
}

export async function getAppWebhookEndpoint(
    db: D1Database,
    endpointId: string,
): Promise<WebhookEndpointRow | null> {
    const r = await db
        .prepare(
            `SELECT id, client_id, url, secret_hash, events, is_active, label,
              created_at, secret_set_at, last_delivery_at, last_status_code, last_error
             FROM oauth_client_webhook_endpoints
             WHERE id = ?`,
        )
        .bind(endpointId)
        .first<WebhookEndpointRow>();
    return r ?? null;
}

export async function createAppWebhookEndpoint(
    db: D1Database,
    row: {
        id: string;
        clientId: string;
        url: string;
        secretHash: string;
        events: string;
        label?: string | null;
    },
): Promise<void> {
    await db
        .prepare(
            `INSERT INTO oauth_client_webhook_endpoints
                (id, client_id, url, secret_hash, events, is_active, label, created_at, secret_set_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .bind(
            row.id,
            row.clientId,
            row.url,
            row.secretHash,
            row.events,
            row.label ?? null,
        )
        .run();
}

export async function updateAppWebhookEndpoint(
    db: D1Database,
    endpointId: string,
    ownerId: string,
    patch: {
        url?: string;
        events?: string;
        is_active?: boolean;
        label?: string | null;
    },
): Promise<boolean> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];
    if ("url" in patch && patch.url !== undefined) {
        sets.push("url = ?");
        values.push(patch.url);
    }
    if ("events" in patch && patch.events !== undefined) {
        sets.push("events = ?");
        values.push(patch.events);
    }
    if ("is_active" in patch && patch.is_active !== undefined) {
        sets.push("is_active = ?");
        values.push(patch.is_active ? 1 : 0);
    }
    if ("label" in patch) {
        sets.push("label = ?");
        values.push(patch.label ?? null);
    }
    if (sets.length === 0) return false;
    values.push(endpointId, ownerId);
    const r = await db
        .prepare(
            `UPDATE oauth_client_webhook_endpoints
             SET ${sets.join(", ")}
             WHERE id = ?
               AND client_id IN (SELECT client_id FROM oauth_clients WHERE owner_id = ?)`,
        )
        .bind(...values)
        .run();
    return (r.meta?.changes ?? 0) > 0;
}

export async function deleteAppWebhookEndpoint(
    db: D1Database,
    endpointId: string,
    ownerId: string,
): Promise<boolean> {
    const r = await db
        .prepare(
            `DELETE FROM oauth_client_webhook_endpoints
             WHERE id = ?
               AND client_id IN (SELECT client_id FROM oauth_clients WHERE owner_id = ?)`,
        )
        .bind(endpointId, ownerId)
        .run();
    return (r.meta?.changes ?? 0) > 0;
}

export async function rotateAppWebhookEndpointSecret(
    db: D1Database,
    endpointId: string,
    ownerId: string,
    newSecretHash: string,
): Promise<boolean> {
    const r = await db
        .prepare(
            `UPDATE oauth_client_webhook_endpoints
             SET secret_hash = ?, secret_set_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND client_id IN (SELECT client_id FROM oauth_clients WHERE owner_id = ?)`,
        )
        .bind(newSecretHash, endpointId, ownerId)
        .run();
    return (r.meta?.changes ?? 0) > 0;
}

export async function stampWebhookEndpointDelivery(
    db: D1Database,
    endpointId: string,
    statusCode: number | null,
    errorText: string | null,
): Promise<void> {
    await db
        .prepare(
            `UPDATE oauth_client_webhook_endpoints
             SET last_delivery_at = CURRENT_TIMESTAMP,
                 last_status_code = ?,
                 last_error = ?
             WHERE id = ?`,
        )
        .bind(statusCode, errorText, endpointId)
        .run();
}

export async function listOAuthClients(
    db: D1Database,
    limit: number = 50,
    offset: number = 0,
) {
    const stmt = db.prepare(
        "SELECT client_id, name, created_at, is_active FROM oauth_clients ORDER BY created_at DESC LIMIT ? OFFSET ?",
    );
    return await stmt.bind(limit, offset).all();
}

export async function createPrivilege(
    db: D1Database,
    {
        id,
        code,
        name,
        description,
        isSystem,
    }: {
        id: string;
        code: string;
        name: string;
        description?: string;
        isSystem?: boolean;
    },
) {
    const stmt = db.prepare(
        `INSERT INTO privileges (id, code, name, description, is_system)
     VALUES (?, ?, ?, ?, ?)`,
    );
    return await stmt
        .bind(id, code, name, description || null, isSystem ? 1 : 0)
        .run();
}

export async function getPrivilegeByCode(db: D1Database, code: string) {
    const stmt = db.prepare("SELECT * FROM privileges WHERE code = ?");
    return await stmt.bind(code).first();
}

export async function grantPrivilegeToUser(
    db: D1Database,
    {
        id,
        userId,
        privilegeId,
        grantedBy,
        expiryDate,
        reason,
    }: {
        id: string;
        userId: string;
        privilegeId: string;
        grantedBy?: string;
        expiryDate?: Date;
        reason?: string;
    },
) {
    const stmt = db.prepare(
        `INSERT INTO user_privileges (id, user_id, privilege_id, granted_by, expiry_date, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    );
    return await stmt
        .bind(
            id,
            userId,
            privilegeId,
            grantedBy || null,
            expiryDate ? expiryDate.toISOString() : null,
            reason || null,
        )
        .run();
}

export async function revokePrivilegeFromUser(
    db: D1Database,
    userId: string,
    privilegeId: string,
) {
    const stmt = db.prepare(
        "DELETE FROM user_privileges WHERE user_id = ? AND privilege_id = ?",
    );
    return await stmt.bind(userId, privilegeId).run();
}

export async function getUserPrivileges(db: D1Database, userId: string) {
    const stmt = db.prepare(
        `SELECT p.id, p.code, p.name, p.description, up.granted_at, up.expiry_date
     FROM user_privileges up
     JOIN privileges p ON up.privilege_id = p.id
     WHERE up.user_id = ? AND (up.expiry_date IS NULL OR up.expiry_date > CURRENT_TIMESTAMP)`,
    );
    return await stmt.bind(userId).all();
}

export async function hasPrivilege(
    db: D1Database,
    userId: string,
    privilegeCode: string,
): Promise<boolean> {
    const stmt = db.prepare(
        `SELECT 1 FROM user_privileges up
     JOIN privileges p ON up.privilege_id = p.id
     WHERE up.user_id = ? AND p.code = ? AND (up.expiry_date IS NULL OR up.expiry_date > CURRENT_TIMESTAMP)`,
    );
    const result = await stmt.bind(userId, privilegeCode).first();
    return !!result;
}

export async function listPrivileges(db: D1Database) {
    const stmt = db.prepare("SELECT * FROM privileges ORDER BY name");
    return await stmt.all();
}

export async function getAdminDashboardStats(
    db: D1Database,
    daysBack: number = 7,
) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startIso = startDate.toISOString().split("T")[0];

    const [
        totalUsersResult,
        activeUsersResult,
        totalAppsResult,
        totalRequestsResult,
        errorRateResult,
    ] = await Promise.all([
        db.prepare("SELECT COUNT(*) as count FROM users").first(),
        db
            .prepare(
                "SELECT COUNT(*) as count FROM users WHERE last_login > ? AND is_active = 1",
            )
            .bind(startDate.toISOString())
            .first(),
        db
            .prepare(
                "SELECT COUNT(*) as count FROM oauth_clients WHERE is_active = 1",
            )
            .first(),
        db
            .prepare(
                "SELECT COALESCE(SUM(requests), 0) as total FROM app_stats WHERE date >= ?",
            )
            .bind(startIso)
            .first(),
        db
            .prepare(
                "SELECT COALESCE(SUM(errors), 0) as errors, COALESCE(SUM(requests), 1) as requests, COALESCE(AVG(avg_response_time), 0) as avg_rt FROM app_stats WHERE date >= ?",
            )
            .bind(startIso)
            .first(),
    ]);

    const totalRequests = (totalRequestsResult as any)?.total || 0;
    const errors = (errorRateResult as any)?.errors || 0;
    const requests = (errorRateResult as any)?.requests || 1;
    const avgResponseTime = Math.round((errorRateResult as any)?.avg_rt || 0);

    return {
        totalUsers: (totalUsersResult as any)?.count || 0,
        activeUsers: (activeUsersResult as any)?.count || 0,
        totalApps: (totalAppsResult as any)?.count || 0,
        totalRequests,
        avgResponseTime,
        errorRate: totalRequests > 0 ? errors / requests : 0,
    };
}

export async function getRequestTrend(db: D1Database, days: number = 7) {
    const results = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const row = (await db
            .prepare(
                "SELECT COALESCE(SUM(requests), 0) as requests, COALESCE(SUM(errors), 0) as errors FROM app_stats WHERE date = ?",
            )
            .bind(dateStr)
            .first()) as any;
        results.push({
            date: dateStr,
            requests: row?.requests || 0,
            errors: row?.errors || 0,
        });
    }
    return results;
}

export async function getTopApps(db: D1Database, limit: number = 5) {
    const stmt = db.prepare(
        `SELECT oc.client_id as id, oc.name,
       COALESCE(SUM(s.requests), 0) as requests,
       COALESCE(SUM(s.users), 0) as users,
       CASE WHEN COALESCE(SUM(s.requests), 0) = 0 THEN 0
            ELSE CAST(COALESCE(SUM(s.errors), 0) AS REAL) / COALESCE(SUM(s.requests), 1)
       END as errorRate
     FROM oauth_clients oc
     LEFT JOIN app_stats s ON oc.client_id = s.client_id
     WHERE oc.is_active = 1
     GROUP BY oc.client_id, oc.name
     ORDER BY requests DESC
     LIMIT ?`,
    );
    const result = await stmt.bind(limit).all();
    return (result.results || []) as any[];
}

export async function listUserOAuthClients(db: D1Database, userId: string) {
    return db
        .prepare(
            `SELECT client_id, name, description, logo_url, homepage_url, redirect_uris, scopes,
              is_active, created_at, last_used, request_count, client_type, audience,
              webhook_url, webhook_events, webhook_secret_set_at, webhook_last_delivery_at
       FROM oauth_clients
       WHERE is_active = 1
         AND (
           owner_id = ?
           OR (
             owner_id IN ('system-lixblogs-cli', 'system-lixrl-cli')
             AND EXISTS (
               SELECT 1 FROM users
               WHERE id = ? AND is_internal = 1
             )
           )
         )
       ORDER BY created_at DESC`,
        )
        .bind(userId, userId)
        .all();
}

export async function getUserNotificationPreferences(
    db: D1Database,
    userId: string,
) {
    return db
        .prepare(
            `SELECT * FROM user_notification_preferences WHERE user_id = ?`,
        )
        .bind(userId)
        .first();
}

export async function upsertUserNotificationPreferences(
    db: D1Database,
    userId: string,
    prefs: {
        email_login_alerts?: boolean;
        email_app_activity?: boolean;
        email_weekly_digest?: boolean;
        email_security_alerts?: boolean;
    },
) {
    const { generateRandomString } = await import("./webcrypto");
    const token = generateRandomString(32);
    return db
        .prepare(
            `INSERT INTO user_notification_preferences
         (user_id, email_login_alerts, email_app_activity, email_weekly_digest, email_security_alerts, unsubscribe_token, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         email_login_alerts = COALESCE(excluded.email_login_alerts, email_login_alerts),
         email_app_activity = COALESCE(excluded.email_app_activity, email_app_activity),
         email_weekly_digest = COALESCE(excluded.email_weekly_digest, email_weekly_digest),
         email_security_alerts = COALESCE(excluded.email_security_alerts, email_security_alerts),
         updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
            userId,
            prefs.email_login_alerts !== undefined
                ? prefs.email_login_alerts
                    ? 1
                    : 0
                : 1,
            prefs.email_app_activity !== undefined
                ? prefs.email_app_activity
                    ? 1
                    : 0
                : 0,
            prefs.email_weekly_digest !== undefined
                ? prefs.email_weekly_digest
                    ? 1
                    : 0
                : 0,
            prefs.email_security_alerts !== undefined
                ? prefs.email_security_alerts
                    ? 1
                    : 0
                : 1,
            token,
        )
        .run();
}
