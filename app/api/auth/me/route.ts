export const runtime = "edge";

import type { D1Database } from "@cloudflare/workers-types";
import { type NextRequest, NextResponse } from "next/server";
import { setAccountSessionsCookie } from "@/lib/account-sessions";
import { getDatabase } from "@/lib/d1-client";
import {
    getRefreshTokenByHash,
    getUserById,
    isUsernameTaken,
    revokeRefreshToken,
    createRefreshToken as storeRefreshToken,
} from "@/lib/db";
import { createAccessToken, createRefreshToken, verifyJWT } from "@/lib/jwt";
import { cacheDel, cacheSet } from "@/lib/kv-cache";
import { validateUsername } from "@/lib/username";
import { generateUUID, hashString } from "@/lib/webcrypto";

async function getUserIdentity(db: D1Database, userId: string) {
    try {
        return await db
            .prepare(
                "SELECT provider, provider_email, provider_profile_url FROM identities WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
            )
            .bind(userId)
            .first();
    } catch {
        return null;
    }
}

/**
 * Auto-refresh: verify the refresh token, issue new access + refresh tokens,
 * set cookies, and return the user profile in one round-trip.
 */
async function tryAutoRefresh(request: NextRequest, refreshToken: string) {
    try {
        const payload = await verifyJWT(refreshToken);
        if (payload?.type !== "refresh") {
            return NextResponse.json(
                { error: "Invalid refresh token" },
                { status: 401 },
            );
        }

        const db = await getDatabase();
        const refreshTokenHash = await hashString(refreshToken);
        const tokenRecord = await getRefreshTokenByHash(db, refreshTokenHash);
        if (!tokenRecord) {
            return NextResponse.json(
                { error: "Refresh token revoked" },
                { status: 401 },
            );
        }

        const user = (await getUserById(db, payload.sub)) as any;
        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 401 },
            );
        }

        const accessMaxAge =
            parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10) * 60;

        // Determine remaining session duration from the refresh token's own expiry
        const refreshRemainingSeconds = Math.max(
            payload.exp - Math.floor(Date.now() / 1000),
            0,
        );
        // Use at least 1 day, or the remaining time on the current refresh token
        const refreshDays = Math.max(
            Math.ceil(refreshRemainingSeconds / 86400),
            1,
        );

        const newAccessToken = await createAccessToken(
            payload.sub,
            user.email,
            payload.provider,
            parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10),
            payload.scopes,
        );
        const newRefreshToken = await createRefreshToken(
            payload.sub,
            payload.provider,
            refreshDays,
            payload.scopes,
        );
        const newRefreshTokenHash = await hashString(newRefreshToken);

        // Rotate refresh token. Carry the device fingerprint from the
        // request through to the new row so the "Active sessions" list
        // keeps showing the same device after rotation (otherwise every
        // token refresh would create a row with NULL metadata).
        const ipAddress =
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
            request.headers.get("cf-connecting-ip") ||
            "";
        const userAgent = request.headers.get("user-agent") || "";
        const { hashIpForSession, shortUaForSession } = await import(
            "@/lib/db"
        );

        await revokeRefreshToken(db, refreshTokenHash);
        await storeRefreshToken(db, {
            id: generateUUID(),
            userId: payload.sub,
            tokenHash: newRefreshTokenHash,
            expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
            ipHash:
                (await hashIpForSession(ipAddress)) ||
                (tokenRecord as any).ip_hash ||
                null,
            uaShort:
                shortUaForSession(userAgent) ||
                (tokenRecord as any).ua_short ||
                null,
        });

        const identity = await getUserIdentity(db, payload.sub);

        const response = NextResponse.json({
            id: payload.sub,
            userId: payload.sub,
            email: user.email,
            displayName: user.display_name || null,
            provider:
                payload.provider || (identity as any)?.provider || "email",
            avatar: (identity as any)?.provider_profile_url || null,
            emailVerified: !!user.email_verified,
            expiresAt: new Date(Date.now() + accessMaxAge * 1000),
        });

        // Set refreshed cookies
        response.cookies.set("access_token", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: accessMaxAge,
            path: "/",
        });
        response.cookies.set("refresh_token", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: refreshDays * 86400,
            path: "/",
        });
        response.cookies.set("user_id", payload.sub, {
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: refreshDays * 86400,
            path: "/",
        });
        await setAccountSessionsCookie(
            request,
            response,
            newRefreshToken,
            refreshDays * 86400,
        );

        console.log("[Me] Auto-refreshed session for user %s", payload.sub);
        return response;
    } catch (err) {
        console.error("[Me] Auto-refresh failed:", err);
        return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }
}

/**
 * GET /api/auth/me
 * Get current user from access token (cookie or Authorization header)
 * Used by frontend to check auth status and get user info
 */
export async function GET(request: NextRequest) {
    try {
        // Accept token from httpOnly cookie or Authorization header
        const cookieToken = request.cookies.get("access_token")?.value;
        const headerToken = request.headers
            .get("authorization")
            ?.replace("Bearer ", "");
        const refreshTokenCookie = request.cookies.get("refresh_token")?.value;
        const accessToken = cookieToken || headerToken;

        // If no access token but refresh token cookie exists, try auto-refresh
        if (!accessToken && refreshTokenCookie) {
            return await tryAutoRefresh(request, refreshTokenCookie);
        }

        if (!accessToken) {
            return NextResponse.json(
                { error: "No access token" },
                { status: 401 },
            );
        }

        const payload = await verifyJWT(accessToken);

        // Access token expired but refresh token cookie exists — auto-refresh
        if (payload?.type !== "access" && refreshTokenCookie && cookieToken) {
            return await tryAutoRefresh(request, refreshTokenCookie);
        }

        if (payload?.type !== "access") {
            return NextResponse.json(
                { error: "Invalid token" },
                { status: 401 },
            );
        }

        try {
            const db = await getDatabase();
            const dbUser = await getUserById(db, payload.sub);

            if (!dbUser) {
                return NextResponse.json(
                    { error: "User not found" },
                    { status: 401 },
                );
            }

            const identity = await getUserIdentity(db, payload.sub);

            // Third-party OAuth tokens carry an explicit scope list. Return
            // only the claims the user approved; first-party session tokens
            // omit `scopes` and retain the full dashboard response.
            if (Array.isArray(payload.scopes)) {
                const scopedProfile: Record<string, unknown> = {
                    sub: payload.sub,
                    id: payload.sub,
                    userId: payload.sub,
                    scopes: payload.scopes,
                    expiresAt: new Date(payload.exp * 1000),
                };
                if (payload.scopes.includes("profile")) {
                    scopedProfile.displayName =
                        (dbUser as any).display_name || null;
                    scopedProfile.username = (dbUser as any).username || null;
                    scopedProfile.avatar =
                        (identity as any)?.provider_profile_url || null;
                }
                if (payload.scopes.includes("email")) {
                    scopedProfile.email = (dbUser as any).email;
                    scopedProfile.emailVerified = !!(dbUser as any)
                        .email_verified;
                }
                return NextResponse.json(scopedProfile);
            }

            // MFA status + setup-required signal. mfa_setup_required is
            // true when the user owns ≥3 OAuth apps but hasn't enabled
            // 2FA — the dashboard layout uses this flag to redirect to
            // /mfa/setup-required (hard wall per the platform policy).
            const mfaEnabled =
                (dbUser as any).mfa_enabled === 1 ||
                (dbUser as any).mfa_enabled === true;
            const appsCountRow = await db
                .prepare(
                    `SELECT COUNT(*) AS n FROM oauth_clients
                     WHERE owner_id = ? AND is_active = 1`,
                )
                .bind(payload.sub)
                .first<{ n: number }>();
            const ownedAppsCount = appsCountRow?.n ?? 0;
            const mfaSetupRequired = ownedAppsCount >= 3 && !mfaEnabled;

            return NextResponse.json({
                id: payload.sub,
                userId: payload.sub,
                email: payload.email,
                username: (dbUser as any).username || null,
                displayName: (dbUser as any).display_name || null,
                provider:
                    payload.provider || (identity as any)?.provider || "email",
                avatar: (identity as any)?.provider_profile_url || null,
                emailVerified: !!(dbUser as any).email_verified,
                bio: (dbUser as any).bio || null,
                country: (dbUser as any).country || null,
                city: (dbUser as any).city || null,
                location: (dbUser as any).freeform_location || null,
                locale: (dbUser as any).locale || null,
                timezone: (dbUser as any).timezone || null,
                mfa_enabled: mfaEnabled,
                mfa_setup_required: mfaSetupRequired,
                owned_apps_count: ownedAppsCount,
                tier: (dbUser as any).tier || "hobby",
                tier_renews_at: (dbUser as any).tier_renews_at || null,
                tier_cancelled_at: (dbUser as any).tier_cancelled_at || null,
                is_internal:
                    (dbUser as any).is_internal === 1 ||
                    (dbUser as any).is_internal === true,
                expiresAt: new Date(payload.exp * 1000),
            });
        } catch (dbError) {
            // Fallback to JWT payload if DB unavailable
            console.error("[Me] DB lookup failed, using JWT payload:", dbError);
            const fallback: Record<string, unknown> = {
                id: payload.sub,
                userId: payload.sub,
                expiresAt: new Date(payload.exp * 1000),
            };
            if (Array.isArray(payload.scopes)) {
                fallback.sub = payload.sub;
                fallback.scopes = payload.scopes;
                if (payload.scopes.includes("email")) {
                    fallback.email = payload.email;
                }
            } else {
                fallback.email = payload.email;
                fallback.provider = payload.provider;
            }
            return NextResponse.json(fallback);
        }
    } catch (error) {
        console.error("Get me error:", error);
        return NextResponse.json(
            { error: "Failed to get user info" },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/auth/me
 * Update current user profile fields (locale, timezone, display_name)
 * display_name: max 2 changes per 14 days
 */
export async function PATCH(request: NextRequest) {
    try {
        const cookieToken = request.cookies.get("access_token")?.value;
        const headerToken = request.headers
            .get("authorization")
            ?.replace("Bearer ", "");
        const accessToken = cookieToken || headerToken;

        if (!accessToken) {
            return NextResponse.json(
                { error: "No access token" },
                { status: 401 },
            );
        }

        const payload = await verifyJWT(accessToken);
        if (payload?.type !== "access") {
            return NextResponse.json(
                { error: "Invalid token" },
                { status: 401 },
            );
        }

        const body: any = await request.json();
        const {
            locale,
            timezone,
            display_name,
            bio,
            country,
            city,
            location,
            username,
            confirm,
        } = body as {
            locale?: string;
            timezone?: string;
            display_name?: string;
            bio?: string;
            country?: string;
            city?: string;
            location?: string;
            username?: string;
            confirm?: boolean;
        };

        // Track username change for KV cache updates after a successful write.
        let usernameChange: { old: string | null; next: string } | null = null;

        // Track display_name change for webhook dispatch after a successful
        // write — receivers (e.g. url.elixpo) subscribe to user.updated to
        // mirror the profile.
        let displayNameChange: string | null = null;

        const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
        const values: (string | number | null)[] = [];

        if (locale !== undefined) {
            setClauses.push("locale = ?");
            values.push(locale);
        }
        if (timezone !== undefined) {
            setClauses.push("timezone = ?");
            values.push(timezone);
        }
        if (bio !== undefined) {
            setClauses.push("bio = ?");
            values.push(bio.slice(0, 256));
        }
        if (country !== undefined) {
            setClauses.push("country = ?");
            values.push(country.slice(0, 64));
        }
        if (city !== undefined) {
            setClauses.push("city = ?");
            values.push(city.slice(0, 64));
        }
        if (location !== undefined) {
            setClauses.push("freeform_location = ?");
            values.push(location.slice(0, 128));
        }

        const db = await getDatabase();

        if (display_name !== undefined) {
            const trimmed = display_name.trim();
            if (trimmed.length < 2 || trimmed.length > 32) {
                return NextResponse.json(
                    { error: "Display name must be 2-32 characters." },
                    { status: 400 },
                );
            }
            if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
                return NextResponse.json(
                    {
                        error: "Only letters, numbers, spaces, hyphens and underscores are allowed.",
                    },
                    { status: 400 },
                );
            }

            // Rate limit: 2 changes per 14 days
            const currentUser = (await getUserById(db, payload.sub)) as any;
            if (!currentUser) {
                return NextResponse.json(
                    { error: "User not found" },
                    { status: 404 },
                );
            }

            const changeCount = currentUser.display_name_change_count || 0;
            const lastChanged = currentUser.display_name_changed_at
                ? new Date(currentUser.display_name_changed_at).getTime()
                : 0;
            const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
            const windowExpired = Date.now() - lastChanged > twoWeeksMs;

            // Reset counter if the 2-week window has passed
            const effectiveCount = windowExpired ? 0 : changeCount;

            if (effectiveCount >= 2) {
                const resetDate = new Date(lastChanged + twoWeeksMs);
                return NextResponse.json(
                    {
                        error: `You can only change your display name 2 times every 2 weeks. Try again after ${resetDate.toLocaleDateString()}.`,
                    },
                    { status: 429 },
                );
            }

            setClauses.push("display_name = ?");
            values.push(trimmed);
            setClauses.push("display_name_changed_at = CURRENT_TIMESTAMP");
            setClauses.push("display_name_change_count = ?");
            values.push(effectiveCount + 1);
            displayNameChange = trimmed;
        }

        if (username !== undefined) {
            const v = validateUsername(username);
            if (!v.ok) {
                return NextResponse.json({ error: v.reason }, { status: 400 });
            }

            const currentUser = (await getUserById(db, payload.sub)) as any;
            if (!currentUser) {
                return NextResponse.json(
                    { error: "User not found" },
                    { status: 404 },
                );
            }
            const current: string | null = currentUser.username || null;

            // Only act when the handle actually changes.
            if (current !== v.value) {
                const isFirstSet = !current;

                if (!isFirstSet) {
                    // Changing an existing handle is destructive (old @links break)
                    // — require explicit confirmation and rate-limit it.
                    if (!confirm) {
                        return NextResponse.json(
                            {
                                error: "Changing your username breaks links pointing to your old handle. Confirm to proceed.",
                                requiresConfirm: true,
                            },
                            { status: 400 },
                        );
                    }
                    const changeCount = currentUser.username_change_count || 0;
                    const lastChanged = currentUser.username_changed_at
                        ? new Date(currentUser.username_changed_at).getTime()
                        : 0;
                    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
                    const windowExpired = Date.now() - lastChanged > twoWeeksMs;
                    const effectiveCount = windowExpired ? 0 : changeCount;
                    if (effectiveCount >= 2) {
                        const resetDate = new Date(lastChanged + twoWeeksMs);
                        return NextResponse.json(
                            {
                                error: `You can only change your username 2 times every 2 weeks. Try again after ${resetDate.toLocaleDateString()}.`,
                            },
                            { status: 429 },
                        );
                    }
                    setClauses.push("username_change_count = ?");
                    values.push(effectiveCount + 1);
                } else {
                    // First-time set: keep the change counter at 0 so the user
                    // still gets their full allowance of later changes.
                    setClauses.push("username_change_count = 0");
                }

                // Friendly pre-check; the UNIQUE index is the real guard.
                if (await isUsernameTaken(db, v.value)) {
                    return NextResponse.json(
                        { error: "That username is taken." },
                        { status: 409 },
                    );
                }

                setClauses.push("username = ?");
                values.push(v.value);
                setClauses.push("username_changed_at = CURRENT_TIMESTAMP");
                usernameChange = { old: current, next: v.value };
            }
        }

        if (values.length === 0) {
            return NextResponse.json(
                { error: "No updatable fields provided" },
                { status: 400 },
            );
        }

        values.push(payload.sub);

        try {
            await db
                .prepare(
                    `UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`,
                )
                .bind(...values)
                .run();

            const dbUser = await getUserById(db, payload.sub);
            if (!dbUser) {
                return NextResponse.json(
                    { error: "User not found" },
                    { status: 404 },
                );
            }

            // Refresh the availability cache so the new handle reads as taken
            // and the freed one (if any) can be reclaimed.
            if (usernameChange) {
                await cacheSet(
                    `username:taken:${usernameChange.next}`,
                    { taken: true },
                    86400,
                );
                if (usernameChange.old) {
                    await cacheDel(`username:taken:${usernameChange.old}`);
                }
            }

            // Fire user.updated webhook to every authorized OAuth app.
            // Awaited so caller-visible state stays consistent in the dev
            // logs, but the helper catches its own errors so we never 500.
            if (displayNameChange !== null || usernameChange !== null) {
                const { fireUserUpdated } = await import("@/lib/user-events");
                await fireUserUpdated(payload.sub, {
                    ...(displayNameChange !== null
                        ? { display_name: displayNameChange }
                        : {}),
                    ...(usernameChange !== null
                        ? { username: usernameChange.next }
                        : {}),
                });
            }

            return NextResponse.json({
                id: payload.sub,
                userId: payload.sub,
                email: payload.email,
                username: (dbUser as any).username || null,
                displayName: (dbUser as any).display_name || null,
                locale: (dbUser as any).locale ?? null,
                timezone: (dbUser as any).timezone ?? null,
                bio: (dbUser as any).bio ?? null,
                country: (dbUser as any).country ?? null,
                city: (dbUser as any).city ?? null,
                location: (dbUser as any).freeform_location ?? null,
                provider: payload.provider,
            });
        } catch (dbError) {
            console.error("[Me] PATCH DB error:", dbError);
            return NextResponse.json(
                { error: "Failed to update user" },
                { status: 500 },
            );
        }
    } catch (error) {
        console.error("[Me] PATCH error:", error);
        return NextResponse.json(
            { error: "Failed to update user info" },
            { status: 500 },
        );
    }
}
