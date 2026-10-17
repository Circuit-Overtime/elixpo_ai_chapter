export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { setAccountSessionsCookie } from "@/lib/account-sessions";
import { getDatabase } from "@/lib/d1-client";
import {
    logAuditEvent,
    createRefreshToken as storeRefreshToken,
} from "@/lib/db";
import { createAccessToken, createRefreshToken } from "@/lib/jwt";
import { kvChallengeStore, verifyAuthentication } from "@/lib/mfa-passkey";
import { verifyTotpCode } from "@/lib/mfa-totp";
import { hashBackupCode, verifyMfaChallengeToken } from "@/lib/mfa-utils";
import {
    mintTrustedDeviceCookie,
    recordTrustedDevice,
    TRUSTED_DEVICE_COOKIE_NAME,
    TRUSTED_DEVICE_COOKIE_TTL_DAYS,
} from "@/lib/trusted-devices";
import { generateUUID, hashString } from "@/lib/webcrypto";

type Method = "totp" | "passkey" | "email_otp" | "backup_code";

/**
 * POST /api/auth/mfa/challenge/verify
 *
 * Final step of an MFA-gated login. The browser has already passed the
 * first factor and holds an mfaToken; here it submits the second factor
 * (TOTP code, WebAuthn assertion, email OTP, or backup code) and on
 * success receives the real access+refresh tokens.
 *
 * Optional `trust_device: true` enrolls this device for 30 days so
 * future logins skip the challenge.
 *
 * Body:
 *   {
 *     mfaToken: string,
 *     method: "totp" | "passkey" | "email_otp" | "backup_code",
 *     code?: string,           // totp / email_otp / backup_code
 *     response?: object,       // WebAuthn assertion JSON
 *     trust_device?: boolean,
 *     device_name?: string,
 *   }
 */
export async function POST(request: NextRequest) {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const mfaToken = body?.mfaToken;
    const method = body?.method as Method;
    if (typeof mfaToken !== "string") {
        return NextResponse.json(
            { error: "mfaToken is required" },
            { status: 400 },
        );
    }
    if (
        method !== "totp" &&
        method !== "passkey" &&
        method !== "email_otp" &&
        method !== "backup_code"
    ) {
        return NextResponse.json({ error: "Unknown method" }, { status: 400 });
    }

    const challenge = await verifyMfaChallengeToken(mfaToken);
    if (!challenge) {
        return NextResponse.json(
            { error: "mfaToken is invalid or expired" },
            { status: 401 },
        );
    }

    const db = await getDatabase();
    const user = (await db
        .prepare(
            "SELECT id, email, display_name, mfa_enabled FROM users WHERE id = ?",
        )
        .bind(challenge.userId)
        .first()) as {
        id: string;
        email: string;
        display_name: string | null;
        mfa_enabled: number;
    } | null;
    if (!user)
        return NextResponse.json({ error: "User not found" }, { status: 404 });

    const ipAddress =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("cf-connecting-ip") ||
        "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const kv = (getRequestContext().env as any).KV as KVNamespace;

    // ── Branch on method ───────────────────────────────────────────────
    let ok = false;
    let usedFactorId: string | null = null;

    if (method === "totp") {
        const code = body?.code;
        if (typeof code !== "string") {
            return NextResponse.json(
                { error: "code is required" },
                { status: 400 },
            );
        }
        const factor = (await db
            .prepare(
                `SELECT id, secret FROM user_mfa_factors
                 WHERE user_id = ? AND kind = 'totp'
                    AND confirmed_at IS NOT NULL
                 LIMIT 1`,
            )
            .bind(user.id)
            .first()) as { id: string; secret: string } | null;
        if (factor && verifyTotpCode(factor.secret, code)) {
            ok = true;
            usedFactorId = factor.id;
        }
    } else if (method === "email_otp") {
        const code = body?.code;
        if (typeof code !== "string") {
            return NextResponse.json(
                { error: "code is required" },
                { status: 400 },
            );
        }
        const stored = await kv.get(`mfa_email_otp:${mfaToken.slice(-32)}`);
        if (stored && stored === code.trim()) {
            await kv.delete(`mfa_email_otp:${mfaToken.slice(-32)}`);
            const factor = (await db
                .prepare(
                    `SELECT id FROM user_mfa_factors
                     WHERE user_id = ? AND kind = 'email_otp'`,
                )
                .bind(user.id)
                .first()) as { id: string } | null;
            ok = true;
            usedFactorId = factor?.id ?? null;
        }
    } else if (method === "backup_code") {
        const code = body?.code;
        if (typeof code !== "string") {
            return NextResponse.json(
                { error: "code is required" },
                { status: 400 },
            );
        }
        const codeHash = await hashBackupCode(code);
        const row = (await db
            .prepare(
                `SELECT id FROM user_mfa_backup_codes
                 WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
                 LIMIT 1`,
            )
            .bind(user.id, codeHash)
            .first()) as { id: string } | null;
        if (row) {
            await db
                .prepare(
                    "UPDATE user_mfa_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
                )
                .bind(row.id)
                .run();
            ok = true;
        }
    } else if (method === "passkey") {
        const response = body?.response;
        if (!response || typeof response !== "object") {
            return NextResponse.json(
                { error: "WebAuthn response is required" },
                { status: 400 },
            );
        }
        const credentialId = response?.id;
        if (typeof credentialId !== "string") {
            return NextResponse.json(
                { error: "Malformed WebAuthn response" },
                { status: 400 },
            );
        }
        const factor = (await db
            .prepare(
                `SELECT id, secret, sign_count, transports
                 FROM user_mfa_factors
                 WHERE user_id = ? AND kind = 'passkey'
                    AND credential_id = ?
                    AND confirmed_at IS NOT NULL`,
            )
            .bind(user.id, credentialId)
            .first()) as {
            id: string;
            secret: string;
            sign_count: number;
            transports: string | null;
        } | null;
        if (factor) {
            const verified = await verifyAuthentication(
                mfaToken.slice(-32),
                response,
                {
                    credentialId,
                    publicKey: factor.secret,
                    signCount: factor.sign_count,
                    transports: factor.transports
                        ? JSON.parse(factor.transports)
                        : undefined,
                },
                kvChallengeStore(kv),
            );
            if (verified) {
                await db
                    .prepare(
                        "UPDATE user_mfa_factors SET sign_count = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
                    )
                    .bind(verified.newSignCount, factor.id)
                    .run();
                ok = true;
                usedFactorId = factor.id;
            }
        }
    }

    if (!ok) {
        // Log the failed attempt for the audit trail; bail.
        await logAuditEvent(db, {
            id: generateUUID(),
            userId: user.id,
            eventType: "mfa.challenge_failed",
            provider: method,
            ipAddress,
            userAgent,
            status: "failure",
        }).catch(() => {});
        return NextResponse.json(
            { error: "Invalid 2FA code" },
            { status: 401 },
        );
    }

    // Stamp last_used_at on the factor (passkey already done above).
    if (usedFactorId && method !== "passkey") {
        await db
            .prepare(
                "UPDATE user_mfa_factors SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(usedFactorId)
            .run()
            .catch(() => {});
    }

    // ── Issue real tokens ──────────────────────────────────────────────
    const refreshDays = parseInt(
        process.env.REFRESH_TOKEN_EXPIRATION_DAYS || "30",
        10,
    );
    const accessMin = parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10);

    const accessToken = await createAccessToken(user.id, user.email);
    const refreshToken = await createRefreshToken(user.id);

    try {
        const refreshTokenHash = await hashString(refreshToken);
        const { hashIpForSession, shortUaForSession } = await import(
            "@/lib/db"
        );
        await storeRefreshToken(db, {
            id: generateUUID(),
            userId: user.id,
            tokenHash: refreshTokenHash,
            expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
            ipHash: await hashIpForSession(ipAddress),
            uaShort: shortUaForSession(userAgent),
        });
    } catch (err) {
        console.error(
            "[mfa challenge verify] refresh-token store failed: %s",
            err instanceof Error ? err.message : String(err),
        );
    }

    await logAuditEvent(db, {
        id: generateUUID(),
        userId: user.id,
        eventType: "mfa.challenge_passed",
        provider: method,
        ipAddress,
        userAgent,
        status: "success",
    }).catch(() => {});

    // Build response with auth cookies.
    const accessMaxAge = accessMin * 60;
    const refreshMaxAge = refreshDays * 24 * 60 * 60;

    const response = NextResponse.json({
        user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name || null,
        },
        tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: accessMaxAge,
            token_type: "Bearer",
        },
        next: challenge.next || "/dashboard/oauth-apps",
    });

    response.cookies.set("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: accessMaxAge,
        path: "/",
    });
    response.cookies.set("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: refreshMaxAge,
        path: "/",
    });
    response.cookies.set("user_id", user.id, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: refreshMaxAge,
        path: "/",
    });
    await setAccountSessionsCookie(
        request,
        response,
        refreshToken,
        refreshMaxAge,
    );

    // ── Optional: trust this device for 30d ────────────────────────────
    if (body?.trust_device === true) {
        const deviceUuid = generateUUID();
        try {
            await recordTrustedDevice(db, {
                id: generateUUID(),
                userId: user.id,
                deviceUuid,
                ip: ipAddress,
                userAgent,
                name:
                    typeof body?.device_name === "string"
                        ? body.device_name.slice(0, 64)
                        : null,
            });
            const cookie = await mintTrustedDeviceCookie(user.id, deviceUuid);
            response.cookies.set(TRUSTED_DEVICE_COOKIE_NAME, cookie, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: TRUSTED_DEVICE_COOKIE_TTL_DAYS * 24 * 60 * 60,
                path: "/",
            });
        } catch (err) {
            console.error(
                "[mfa challenge verify] trust-device failed: %s",
                err instanceof Error ? err.message : String(err),
            );
        }
    }

    return response;
}
