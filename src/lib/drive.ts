/**
 * Google Drive connection (per workspace). OAuth with the narrow `drive.file`
 * scope so the app only ever touches files the user explicitly picks via the
 * Google Picker — no "sensitive scope" verification gate. Tokens are stored
 * AES-GCM encrypted (same as sender app passwords) and refreshed on demand.
 *
 * Needs: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. The OAuth redirect is
 * `${appUrl}/api/drive/callback`.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { base64url, base64urlDecode, hmacSha256Hex, timingSafeEqual } from "./crypto";
import { decryptSecret, encryptSecret } from "./encryption";
import { appUrl, getEnv, requireEnv } from "./env";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
// openid+email identify the connected account; drive.file = picked files only.
const SCOPE = "openid email https://www.googleapis.com/auth/drive.file";

/** The OAuth client id — server var, or the public one (same value) as fallback. */
async function googleClientId(): Promise<string | undefined> {
    return (await getEnv("GOOGLE_CLIENT_ID")) || (await getEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID"));
}

export async function driveConfigured(): Promise<boolean> {
    const [id, secret] = await Promise.all([googleClientId(), getEnv("GOOGLE_CLIENT_SECRET")]);
    return Boolean(id && secret);
}

async function redirectUri(): Promise<string> {
    return `${await appUrl()}/api/drive/callback`;
}

// ─── CSRF state (stateless, signed with the session secret) ─────────────────

export async function signState(tenantId: string): Promise<string> {
    const secret = await requireEnv("ELIXPO_MAIL_SESSION_SECRET");
    const body = base64url(
        JSON.stringify({ t: tenantId, exp: Math.floor(Date.now() / 1000) + 600 }),
    );
    const sig = await hmacSha256Hex(secret, body);
    return `${body}.${sig}`;
}

export async function verifyState(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    const secret = await getEnv("ELIXPO_MAIL_SESSION_SECRET");
    if (!secret) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!timingSafeEqual(await hmacSha256Hex(secret, body), sig)) return null;
    try {
        const data = JSON.parse(base64urlDecode(body)) as { t: string; exp: number };
        if (data.exp < Math.floor(Date.now() / 1000)) return null;
        return data.t;
    } catch {
        return null;
    }
}

// ─── OAuth flow ──────────────────────────────────────────────────────────────

export async function buildAuthUrl(tenantId: string): Promise<string> {
    const clientId = (await googleClientId()) || (await requireEnv("GOOGLE_CLIENT_ID"));
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: await redirectUri(),
        response_type: "code",
        scope: SCOPE,
        access_type: "offline", // get a refresh token
        prompt: "consent",
        include_granted_scopes: "true",
        state: await signState(tenantId),
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    id_token?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
    const [clientId, clientSecret] = await Promise.all([
        googleClientId(),
        requireEnv("GOOGLE_CLIENT_SECRET"),
    ]);
    const res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId || "",
            client_secret: clientSecret,
            redirect_uri: await redirectUri(),
            grant_type: "authorization_code",
        }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !data?.access_token) {
        throw new Error(data?.error_description || data?.error || "token exchange failed");
    }
    return data as TokenResponse;
}

/** Decode the (already-trusted, TLS-delivered) id_token for sub + email. */
function decodeIdToken(idToken?: string): { sub?: string; email?: string } {
    if (!idToken) return {};
    try {
        const payload = idToken.split(".")[1];
        const json = JSON.parse(base64urlDecode(payload)) as { sub?: string; email?: string };
        return { sub: json.sub, email: json.email };
    } catch {
        return {};
    }
}

// ─── Connection storage ──────────────────────────────────────────────────────

export interface DriveConnectionRow {
    tenant_id: string;
    google_sub: string | null;
    email: string | null;
    access_token_enc: string;
    refresh_token_enc: string | null;
    scope: string | null;
    expiry: string | null;
    created_at: string;
    updated_at: string;
}

export async function getConnection(
    db: D1Database,
    tenantId: string,
): Promise<DriveConnectionRow | null> {
    return (await db
        .prepare("SELECT * FROM drive_connections WHERE tenant_id = ?")
        .bind(tenantId)
        .first()) as DriveConnectionRow | null;
}

export async function connectionStatus(
    db: D1Database,
    tenantId: string,
): Promise<{ connected: boolean; email: string | null }> {
    const row = await getConnection(db, tenantId);
    return { connected: Boolean(row), email: row?.email ?? null };
}

function expiryIso(expiresIn: number): string {
    return new Date(Date.now() + (expiresIn - 60) * 1000) // refresh 60s early
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
}

/** Persist (upsert) the workspace's Drive connection from a token response. */
export async function saveConnection(
    db: D1Database,
    tenantId: string,
    token: TokenResponse,
): Promise<void> {
    const { sub, email } = decodeIdToken(token.id_token);
    const accessEnc = await encryptSecret(token.access_token);
    const refreshEnc = token.refresh_token ? await encryptSecret(token.refresh_token) : null;
    await db
        .prepare(
            `INSERT INTO drive_connections
                (tenant_id, google_sub, email, access_token_enc, refresh_token_enc, scope, expiry)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(tenant_id) DO UPDATE SET
                google_sub = excluded.google_sub,
                email = excluded.email,
                access_token_enc = excluded.access_token_enc,
                refresh_token_enc = COALESCE(excluded.refresh_token_enc, drive_connections.refresh_token_enc),
                scope = excluded.scope,
                expiry = excluded.expiry,
                updated_at = datetime('now')`,
        )
        .bind(
            tenantId,
            sub || null,
            email || null,
            accessEnc,
            refreshEnc,
            token.scope || SCOPE,
            expiryIso(token.expires_in),
        )
        .run();
}

export async function deleteConnection(db: D1Database, tenantId: string): Promise<void> {
    const row = await getConnection(db, tenantId);
    if (row) {
        // Best-effort revoke at Google so access is actually withdrawn.
        try {
            const token = await decryptSecret(row.refresh_token_enc || row.access_token_enc);
            await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
                method: "POST",
            });
        } catch {
            /* ignore */
        }
    }
    await db.prepare("DELETE FROM drive_connections WHERE tenant_id = ?").bind(tenantId).run();
}

/**
 * Return a currently-valid access token for the workspace, refreshing it with
 * the refresh token when expired. Null if not connected / unrecoverable.
 * (Used by the send pipeline to download picked Drive files — phase 2.)
 */
export async function getAccessToken(db: D1Database, tenantId: string): Promise<string | null> {
    const row = await getConnection(db, tenantId);
    if (!row) return null;

    const stillValid =
        row.expiry && row.expiry > new Date().toISOString().replace("T", " ").slice(0, 19);
    if (stillValid) {
        try {
            return await decryptSecret(row.access_token_enc);
        } catch {
            return null;
        }
    }
    if (!row.refresh_token_enc) return null;

    let refresh: string;
    try {
        refresh = await decryptSecret(row.refresh_token_enc);
    } catch {
        return null;
    }
    const [clientId, clientSecret] = await Promise.all([
        googleClientId(),
        getEnv("GOOGLE_CLIENT_SECRET"),
    ]);
    if (!clientId || !clientSecret) return null;

    const res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refresh,
            grant_type: "refresh_token",
        }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !data?.access_token) return null;

    await db
        .prepare(
            "UPDATE drive_connections SET access_token_enc = ?, expiry = ?, updated_at = datetime('now') WHERE tenant_id = ?",
        )
        .bind(await encryptSecret(data.access_token), expiryIso(data.expires_in), tenantId)
        .run();
    return data.access_token as string;
}
