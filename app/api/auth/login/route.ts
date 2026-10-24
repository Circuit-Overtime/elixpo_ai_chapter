export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { setAccountSessionsCookie } from "@/lib/account-sessions";
import { getDatabase } from "@/lib/d1-client";
import {
    deriveSessionContext,
    getIdentitiesByUserId,
    getUserByEmail,
    getUserByEmailWithPassword,
    logAuditEvent,
    createRefreshToken as storeRefreshToken,
    updateUserLastLogin,
    updateUserSessionContext,
} from "@/lib/db";
import { createAccessToken, createRefreshToken } from "@/lib/jwt";
import { verifyPassword } from "@/lib/password";
import { createLoginRateLimiter } from "@/lib/rate-limit";
import { generateUUID, hashString } from "@/lib/webcrypto";

/**
 * POST /api/auth/login
 *
 * Login user with email/password or OAuth provider
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "userpassword", // required for email provider
 *   "provider": "google|github|email",
 *   "oauth_code": "authorization_code" // for OAuth
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body: any = await request.json();
        const { email, password, provider, oauth_code, rememberMe } = body;

        const ipAddress =
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
            request.headers.get("cf-connecting-ip") ||
            "unknown";
        const userAgent = request.headers.get("user-agent") || "unknown";

        const db = await getDatabase();

        // Rate limiting: 10 login attempts per IP per minute
        try {
            const rateLimiter = createLoginRateLimiter();
            const rateLimit = await rateLimiter.check(db, ipAddress, "login");
            if (!rateLimit.allowed) {
                console.warn(
                    `[Login] Rate limit exceeded for IP: ${ipAddress}. Retry after ${rateLimit.retryAfter}s`,
                );
                await logAuditEvent(db, {
                    id: generateUUID(),
                    eventType: "login_attempt",
                    ipAddress,
                    userAgent,
                    status: "failure",
                    errorMessage: "Rate limited",
                });
                return NextResponse.json(
                    {
                        error: "Too many login attempts. Please try again later.",
                        retryAfter: rateLimit.retryAfter,
                    },
                    {
                        status: 429,
                        headers: {
                            "Retry-After": (
                                rateLimit.retryAfter || 900
                            ).toString(),
                        },
                    },
                );
            }
        } catch (rateLimitError) {
            console.error("[Login] Rate limit check error:", rateLimitError);
        }

        if (!email || !provider) {
            return NextResponse.json(
                { error: "email and provider are required" },
                { status: 400 },
            );
        }

        let user: any;

        if (provider === "email") {
            if (!password) {
                return NextResponse.json(
                    { error: "password is required for email provider" },
                    { status: 400 },
                );
            }

            // Fetch user with password hash
            try {
                const dbUser = await getUserByEmailWithPassword(db, email);
                if (!dbUser) {
                    await logAuditEvent(db, {
                        id: generateUUID(),
                        eventType: "login_attempt",
                        ipAddress,
                        userAgent,
                        status: "failure",
                        errorMessage: "User not found",
                    });
                    return NextResponse.json(
                        { error: "Invalid email or password" },
                        { status: 401 },
                    );
                }

                // Verify password
                const passwordHash = (dbUser as any).password_hash;
                if (!passwordHash) {
                    return NextResponse.json(
                        {
                            error: "This account does not have a password. Please use OAuth login.",
                        },
                        { status: 401 },
                    );
                }

                const isValid = await verifyPassword(password, passwordHash);
                if (!isValid) {
                    await logAuditEvent(db, {
                        id: generateUUID(),
                        userId: (dbUser as any).id,
                        eventType: "login_attempt",
                        provider: "email",
                        ipAddress,
                        userAgent,
                        status: "failure",
                        errorMessage: "Invalid password",
                    });
                    return NextResponse.json(
                        { error: "Invalid email or password" },
                        { status: 401 },
                    );
                }

                user = dbUser;
            } catch (dbError) {
                console.error("[Login] Database error:", dbError);
                return NextResponse.json(
                    { error: "Login failed due to server error" },
                    { status: 500 },
                );
            }
        } else if (provider === "google" || provider === "github") {
            if (!oauth_code) {
                return NextResponse.json(
                    {
                        error: `oauth_code is required for ${provider} provider`,
                    },
                    { status: 400 },
                );
            }

            // Check provider lock-in
            try {
                const existingUser = await getUserByEmail(db, email);
                if (existingUser) {
                    const identitiesResult = await getIdentitiesByUserId(
                        db,
                        (existingUser as any).id,
                    );
                    const identities: any[] =
                        (identitiesResult as any)?.results || [];
                    const registeredProviders = identities.map(
                        (id: any) => id.provider,
                    );

                    if (
                        registeredProviders.length > 0 &&
                        !registeredProviders.includes(provider)
                    ) {
                        const providerList = registeredProviders.join(", ");
                        return NextResponse.json(
                            {
                                error: `This account was registered with ${providerList}. Please login with ${registeredProviders.length === 1 ? "that" : "one of those"} provider.`,
                                registeredProviders,
                            },
                            { status: 403 },
                        );
                    }
                    user = existingUser;
                }
            } catch (error) {
                console.error("[Login] Provider lock-in check error:", error);
            }

            if (!user) {
                return NextResponse.json(
                    {
                        error: "No account found. Please register first.",
                        action: "register",
                    },
                    { status: 404 },
                );
            }
        } else {
            return NextResponse.json(
                { error: `unsupported provider: ${provider}` },
                { status: 400 },
            );
        }

        // ── MFA gate ──────────────────────────────────────────────────
        // Credentials are valid; before issuing tokens, decide whether
        // the user must pass a second factor. The gate is skipped if:
        //   - mfa_enabled is 0, OR
        //   - the request carries a valid trusted_device cookie matching
        //     an active row for this user.
        // Otherwise we return { requiresMfa: true, mfaToken } and STOP —
        // no access/refresh tokens issued. The client redirects to /mfa.
        if (user.mfa_enabled === 1 || user.mfa_enabled === true) {
            const {
                TRUSTED_DEVICE_COOKIE_NAME,
                verifyTrustedDeviceCookie,
                isDeviceTrusted,
            } = await import("@/lib/trusted-devices");
            const tdCookie = request.cookies.get(
                TRUSTED_DEVICE_COOKIE_NAME,
            )?.value;
            let trustedSkip = false;
            if (tdCookie) {
                const decoded = await verifyTrustedDeviceCookie(tdCookie);
                if (
                    decoded &&
                    decoded.userId === user.id &&
                    (await isDeviceTrusted(db, user.id, decoded.deviceUuid))
                ) {
                    trustedSkip = true;
                }
            }

            if (!trustedSkip) {
                const { mintMfaChallengeToken } = await import(
                    "@/lib/mfa-utils"
                );
                const factorsRes = await db
                    .prepare(
                        `SELECT kind FROM user_mfa_factors
                         WHERE user_id = ? AND confirmed_at IS NOT NULL`,
                    )
                    .bind(user.id)
                    .all<{ kind: string }>();
                const kinds = new Set(
                    (factorsRes.results || []).map((r) => r.kind),
                );
                const availableMethods: string[] = [];
                if (kinds.has("passkey")) availableMethods.push("passkey");
                if (kinds.has("totp")) availableMethods.push("totp");
                if (kinds.has("email_otp")) availableMethods.push("email_otp");
                availableMethods.push("backup_code"); // always offered

                const mfaToken = await mintMfaChallengeToken(user.id);
                return NextResponse.json({
                    requiresMfa: true,
                    mfaToken,
                    availableMethods,
                });
            }
        }

        // Session duration: 30 days default, 90 days with "remember me"
        const refreshDays = rememberMe ? 90 : 30;

        const accessToken = await createAccessToken(
            user.id,
            email,
            provider as any,
            parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10),
        );
        const refreshTokenJWT = await createRefreshToken(
            user.id,
            provider as any,
            refreshDays,
        );

        // Store refresh token and log success
        try {
            const refreshTokenHash = await hashString(refreshTokenJWT);
            const { hashIpForSession, shortUaForSession } = await import(
                "@/lib/db"
            );
            await storeRefreshToken(db, {
                id: generateUUID(),
                userId: user.id,
                tokenHash: refreshTokenHash,
                expiresAt: new Date(
                    Date.now() + refreshDays * 24 * 60 * 60 * 1000,
                ),
                ipHash: await hashIpForSession(ipAddress),
                uaShort: shortUaForSession(userAgent),
            });

            await updateUserLastLogin(db, user.id);
            // Populate session-context columns (IP, country, browser,
            // OS, locale) on the users row. COALESCE-based so a request
            // missing some headers won't blank out previously-set values.
            await updateUserSessionContext(
                db,
                user.id,
                deriveSessionContext(request),
            );

            await logAuditEvent(db, {
                id: generateUUID(),
                userId: user.id,
                eventType: "login_success",
                provider,
                ipAddress,
                userAgent,
                status: "success",
            });
        } catch (dbError) {
            console.error("[Login] Database storage error:", dbError);
        }

        // Fire the new-device alert after audit log success. Throttled in
        // KV per (user, IP, UA) so stable-device logins stay quiet.
        try {
            const { notifyNewDeviceSignIn } = await import(
                "@/lib/sign-in-alert"
            );
            await notifyNewDeviceSignIn({
                userId: user.id,
                email: user.email,
                displayName: user.display_name || null,
                ipAddress,
                userAgent,
            });
        } catch {
            /* non-fatal */
        }

        const accessMaxAge =
            parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10) * 60;
        const refreshMaxAge = refreshDays * 24 * 60 * 60;

        const response = NextResponse.json({
            user: {
                id: user.id,
                email,
                provider,
                displayName: user.display_name || null,
            },
            tokens: {
                access_token: accessToken,
                refresh_token: refreshTokenJWT,
                expires_in: accessMaxAge,
                token_type: "Bearer",
            },
            // If email/password user has no display name, prompt them to set one
            ...(provider === "email" &&
                !user.display_name && { needsDisplayName: true }),
        });

        // Set secure httpOnly cookies
        response.cookies.set("access_token", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: accessMaxAge,
            path: "/",
        });

        response.cookies.set("refresh_token", refreshTokenJWT, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: refreshMaxAge,
            path: "/",
        });

        // Non-httpOnly cookie for client-side auth checks (lives as long as the session)
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
            refreshTokenJWT,
            refreshMaxAge,
        );

        return response;
    } catch (error) {
        console.error("[Login] Error:", error);
        return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }
}
