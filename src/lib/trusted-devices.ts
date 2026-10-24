/**
 * Trusted-device tracking.
 *
 * After the user passes 2FA, they can opt to mark the current device as
 * trusted. The server then:
 *   1. Issues a signed `trusted_device` cookie (30d, JWT EdDSA) carrying
 *      user_id + device_uuid.
 *   2. Inserts/updates a trusted_devices row so the user can see and
 *      revoke from /dashboard/security.
 *
 * On the next login, we check the cookie:
 *   - signature valid
 *   - user_id matches the authenticated identity
 *   - row exists for (user_id, device_uuid) and revoked_at IS NULL
 * If all three are true, we skip the 2FA challenge.
 *
 * The signed cookie is the auth — the DB row is the audit trail + the
 * revoke hook. Without the row, the cookie alone won't bypass 2FA.
 */

import * as jose from "jose";
import { getSigningKey, getVerifyingKey } from "./jwt";

const COOKIE_NAME = "trusted_device";
const COOKIE_TTL_DAYS = 30;

export interface TrustedDevicePayload {
    sub: string; // user_id
    device_uuid: string;
    iat: number;
    exp: number;
}

export async function mintTrustedDeviceCookie(
    userId: string,
    deviceUuid: string,
): Promise<string> {
    const key = await getSigningKey();
    return new jose.SignJWT({ sub: userId, device_uuid: deviceUuid })
        .setProtectedHeader({ alg: "EdDSA" })
        .setIssuedAt()
        .setExpirationTime(`${COOKIE_TTL_DAYS}d`)
        .sign(key);
}

export async function verifyTrustedDeviceCookie(
    token: string,
): Promise<{ userId: string; deviceUuid: string } | null> {
    try {
        const key = await getVerifyingKey();
        const { payload } = await jose.jwtVerify(token, key, {
            algorithms: ["EdDSA"],
        });
        const p = payload as any;
        if (typeof p.sub !== "string" || typeof p.device_uuid !== "string") {
            return null;
        }
        return { userId: p.sub, deviceUuid: p.device_uuid };
    } catch {
        return null;
    }
}

// ── DB helpers ──────────────────────────────────────────────────────────

export interface TrustedDeviceRow {
    id: string;
    user_id: string;
    device_uuid: string;
    name: string | null;
    ip_hash: string | null;
    ua_short: string | null;
    last_seen_at: string;
    created_at: string;
    revoked_at: string | null;
}

async function hashIp(ip: string): Promise<string> {
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(ip),
    );
    let hex = "";
    for (const b of new Uint8Array(buf)) hex += b.toString(16).padStart(2, "0");
    return hex.slice(0, 32); // half SHA-256 is plenty for uniqueness
}

// Best-effort short UA — full strings are useless in a UI.
function shortUA(ua: string): string {
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

export async function recordTrustedDevice(
    db: D1Database,
    args: {
        id: string;
        userId: string;
        deviceUuid: string;
        ip: string;
        userAgent: string;
        name?: string | null;
    },
): Promise<void> {
    const ipHash = args.ip ? await hashIp(args.ip) : null;
    const ua = shortUA(args.userAgent || "");

    // Idempotent: if (user_id, device_uuid) already exists, bump last_seen.
    const existing = await db
        .prepare(
            "SELECT id FROM trusted_devices WHERE user_id = ? AND device_uuid = ?",
        )
        .bind(args.userId, args.deviceUuid)
        .first<{ id: string }>();

    if (existing) {
        await db
            .prepare(
                `UPDATE trusted_devices
                 SET last_seen_at = CURRENT_TIMESTAMP,
                     revoked_at = NULL
                 WHERE id = ?`,
            )
            .bind(existing.id)
            .run();
        return;
    }

    await db
        .prepare(
            `INSERT INTO trusted_devices
                (id, user_id, device_uuid, name, ip_hash, ua_short)
             VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            args.id,
            args.userId,
            args.deviceUuid,
            args.name ?? null,
            ipHash,
            ua,
        )
        .run();
}

export async function isDeviceTrusted(
    db: D1Database,
    userId: string,
    deviceUuid: string,
): Promise<boolean> {
    const row = await db
        .prepare(
            `SELECT id FROM trusted_devices
             WHERE user_id = ? AND device_uuid = ? AND revoked_at IS NULL
             LIMIT 1`,
        )
        .bind(userId, deviceUuid)
        .first<{ id: string }>();
    if (!row) return false;
    // Touch last_seen on every successful skip so the UI shows useful data.
    await db
        .prepare(
            "UPDATE trusted_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(row.id)
        .run()
        .catch(() => {});
    return true;
}

export async function listTrustedDevices(
    db: D1Database,
    userId: string,
): Promise<TrustedDeviceRow[]> {
    const r = await db
        .prepare(
            `SELECT id, user_id, device_uuid, name, ip_hash, ua_short,
              last_seen_at, created_at, revoked_at
             FROM trusted_devices
             WHERE user_id = ?
             ORDER BY last_seen_at DESC`,
        )
        .bind(userId)
        .all<TrustedDeviceRow>();
    return r.results || [];
}

export async function revokeTrustedDeviceById(
    db: D1Database,
    userId: string,
    deviceRowId: string,
): Promise<boolean> {
    const r = await db
        .prepare(
            `UPDATE trusted_devices SET revoked_at = CURRENT_TIMESTAMP
             WHERE id = ? AND user_id = ?`,
        )
        .bind(deviceRowId, userId)
        .run();
    return (r.meta?.changes ?? 0) > 0;
}

export const TRUSTED_DEVICE_COOKIE_NAME = COOKIE_NAME;
export const TRUSTED_DEVICE_COOKIE_TTL_DAYS = COOKIE_TTL_DAYS;
