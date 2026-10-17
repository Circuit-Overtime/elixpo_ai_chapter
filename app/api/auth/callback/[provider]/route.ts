export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { setAccountSessionsCookie } from "@/lib/account-sessions";
import { getDatabase } from "@/lib/d1-client";
import {
    createIdentity,
    createRefreshToken,
    createUser,
    deriveSessionContext,
    getIdentitiesByUserId,
    getIdentityByProvider,
    getUserByEmail,
    getUserById,
    logAuditEvent,
    updateUserLastLogin,
    updateUserSessionContext,
} from "@/lib/db";
import {
    createAccessToken,
    createRefreshToken as createRefreshTokenJWT,
} from "@/lib/jwt";
import { getOAuthConfig } from "@/lib/oauth-config";
import { generateUUID, hashString } from "@/lib/webcrypto";

/**
 * GET /api/auth/callback/[provider]?code=...&state=...
 * OAuth callback handler
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> },
) {
    const { provider } = await params;
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    const ipAddress =
        request.headers.get("x-forwarded-for") ||
        request.headers.get("cf-connecting-ip") ||
        "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    try {
        // Handle OAuth provider errors (e.g. user denied access)
        if (error) {
            console.error(
                `OAuth error from ${provider}:`,
                error,
                errorDescription,
            );
            return NextResponse.redirect(
                new URL(
                    `/error?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || "Authentication failed")}`,
                    request.url,
                ),
            );
        }

        // Validate required parameters
        if (!code || !state) {
            return NextResponse.redirect(
                new URL(
                    "/error?error=invalid_request&description=Missing+code+or+state+parameter",
                    request.url,
                ),
            );
        }

        // Validate state cookie
        const storedState = request.cookies.get("oauth_state")?.value;
        const oauthMode = request.cookies.get("oauth_mode")?.value || "login";

        if (!storedState || storedState !== state) {
            console.error("OAuth state mismatch:", { storedState, state });
            return NextResponse.redirect(
                new URL(
                    "/error?error=invalid_state&description=State+validation+failed.+Please+try+again.",
                    request.url,
                ),
            );
        }

        // Get OAuth config — derive origin from the request so it works in any environment
        const origin = new URL(request.url).origin;
        const config = getOAuthConfig(
            provider.toLowerCase(),
            {
                GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
                GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
                GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
                GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
                DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
                DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
                MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
                MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
            },
            origin,
        );

        if (!config) {
            return NextResponse.redirect(
                new URL(
                    `/error?error=unsupported_provider&description=Provider+${provider}+is+not+supported`,
                    request.url,
                ),
            );
        }

        // Exchange authorization code for access token
        const tokenResponse = await exchangeCodeForTokens(code, config);

        if (!tokenResponse?.access_token) {
            console.error("Failed to exchange code for tokens");
            return NextResponse.redirect(
                new URL(
                    "/error?error=token_exchange_failed&description=Failed+to+exchange+authorization+code",
                    request.url,
                ),
            );
        }

        // Fetch user info from provider
        const userInfo = await fetchUserInfoFromProvider(
            provider.toLowerCase(),
            tokenResponse.access_token,
            config.userInfoEndpoint,
        );

        if (!userInfo?.sub) {
            console.error("Failed to fetch user info from provider");
            return NextResponse.redirect(
                new URL(
                    "/error?error=user_info_failed&description=Failed+to+retrieve+user+information",
                    request.url,
                ),
            );
        }

        const db = await getDatabase();

        // A real email is mandatory — no account is created without one. GitHub
        // (and rarely Google) can omit it; fetchUserInfoFromProvider already tries
        // the provider's email endpoint. If still missing, stop here.
        if (!userInfo.email) {
            return NextResponse.redirect(
                new URL(
                    "/error?error=email_required&description=Your+account+has+no+verified+email.+Make+an+email+public+with+this+provider+or+sign+up+with+email.",
                    request.url,
                ),
            );
        }
        const email = userInfo.email;

        // --- Core logic: check identity and cross-provider conflicts ---

        // 1. Check if this exact provider identity already exists
        const existingIdentity = await getIdentityByProvider(
            db,
            provider.toLowerCase(),
            userInfo.sub,
        );

        if (existingIdentity) {
            // Identity exists — this is a returning user.
            //
            // If the provider's avatar URL changed since we last saw them,
            // refresh `identities.provider_profile_url` and fire a
            // user.updated webhook so subscribed apps can sync their
            // mirrored avatar. Cheap to compare — single column read.
            const storedPicture =
                (existingIdentity as any).provider_profile_url || null;
            const newPicture = userInfo.picture || null;
            if (newPicture && newPicture !== storedPicture) {
                try {
                    await db
                        .prepare(
                            "UPDATE identities SET provider_profile_url = ? WHERE id = ?",
                        )
                        .bind(newPicture, (existingIdentity as any).id)
                        .run();
                    const { fireUserUpdated } = await import(
                        "@/lib/user-events"
                    );
                    await fireUserUpdated((existingIdentity as any).user_id, {
                        avatar_url: newPicture,
                    });
                } catch (err) {
                    console.error(
                        "[callback] avatar refresh failed (non-fatal):",
                        err,
                    );
                }
            }

            if (oauthMode === "register") {
                // They're trying to register but already have an account — just log them in
                const existingUser = await getUserById(
                    db,
                    (existingIdentity as any).user_id,
                );
                if (!existingUser) {
                    return NextResponse.redirect(
                        new URL(
                            "/error?error=account_error&description=Account+data+is+inconsistent.+Please+contact+support.",
                            request.url,
                        ),
                    );
                }
                return await buildSuccessResponse(
                    request,
                    db,
                    existingUser,
                    email,
                    provider,
                    ipAddress,
                    userAgent,
                );
            }

            // Login mode — identity found, log in
            const existingUser = await getUserById(
                db,
                (existingIdentity as any).user_id,
            );
            if (!existingUser) {
                return NextResponse.redirect(
                    new URL(
                        "/error?error=account_error&description=Account+data+is+inconsistent.+Please+contact+support.",
                        request.url,
                    ),
                );
            }
            return await buildSuccessResponse(
                request,
                db,
                existingUser,
                email,
                provider,
                ipAddress,
                userAgent,
            );
        }

        // 2. No identity found — check if email is taken by another provider
        const existingUserByEmail = await getUserByEmail(db, email);

        if (existingUserByEmail) {
            // Email exists — check what providers they registered with
            const identitiesResult = await getIdentitiesByUserId(
                db,
                (existingUserByEmail as any).id,
            );
            const identities: any[] = (identitiesResult as any)?.results || [];
            const registeredProviders = identities
                .map((i: any) => i.provider)
                .filter(Boolean);
            const providerList =
                registeredProviders.length > 0
                    ? registeredProviders.join(", ")
                    : "a different method";

            // Block regardless of mode — they must use the provider they registered with
            return NextResponse.redirect(
                new URL(
                    `/error?error=provider_conflict&description=${encodeURIComponent(
                        `An account with this email already exists using ${providerList}. Please sign in with that provider instead.`,
                    )}`,
                    request.url,
                ),
            );
        }

        // 3. No existing user at all
        if (oauthMode === "login") {
            // Login attempted but no account exists — tell them to register first
            return NextResponse.redirect(
                new URL(
                    `/error?error=account_not_found&description=${encodeURIComponent(
                        "No account found with this email. Please register first.",
                    )}`,
                    request.url,
                ),
            );
        }

        // 4. Register mode + new user — create account
        const userId = generateUUID();

        try {
            await createUser(db, { id: userId, email });

            // OAuth users have provider-verified emails
            await db
                .prepare(
                    "UPDATE users SET email_verified = 1, email_verified_at = CURRENT_TIMESTAMP WHERE id = ?",
                )
                .bind(userId)
                .run();

            await createIdentity(db, {
                id: generateUUID(),
                userId,
                provider: provider.toLowerCase(),
                providerUserId: userInfo.sub,
                providerEmail: userInfo.email,
                providerProfileUrl: userInfo.picture,
            });

            await logAuditEvent(db, {
                id: generateUUID(),
                userId,
                eventType: "registration",
                provider: provider.toLowerCase(),
                ipAddress,
                userAgent,
                status: "success",
            });
        } catch (dbError) {
            console.error("Failed to create user/identity in DB:", dbError);
            return NextResponse.redirect(
                new URL(
                    "/error?error=server_error&description=Failed+to+create+your+account.+Please+try+again.",
                    request.url,
                ),
            );
        }

        const newUser = { id: userId, email };
        return await buildSuccessResponse(
            request,
            db,
            newUser,
            email,
            provider,
            ipAddress,
            userAgent,
        );
    } catch (err) {
        console.error(
            "OAuth callback error for %s: %s",
            provider,
            err instanceof Error ? err.message : String(err),
        );
        return NextResponse.redirect(
            new URL(
                "/error?error=server_error&description=An+unexpected+error+occurred+during+authentication",
                request.url,
            ),
        );
    }
}

/**
 * Build a successful auth response: issue tokens, set cookies, redirect to destination.
 * If an oauth_next cookie exists (from the SSO flow initiated during an OAuth authorize),
 * redirect there instead of the default dashboard.
 */
async function buildSuccessResponse(
    request: NextRequest,
    db: any,
    user: any,
    email: string,
    provider: string,
    ipAddress: string,
    userAgent: string,
) {
    // Ensure OAuth users are marked as email-verified
    try {
        await db
            .prepare(
                "UPDATE users SET email_verified = 1, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ? AND email_verified = 0",
            )
            .bind(user.id)
            .run();
    } catch {
        /* non-critical */
    }

    // ── MFA gate (mirrors /api/auth/login) ─────────────────────────────
    // If the user has MFA enabled and this device isn't trusted, do NOT
    // mint tokens. Instead, redirect the browser to /mfa?mfaToken=...
    // The challenge page POSTs to /api/auth/mfa/challenge/verify which
    // issues the real tokens after the second factor succeeds.
    if ((user as any).mfa_enabled === 1) {
        const {
            TRUSTED_DEVICE_COOKIE_NAME,
            verifyTrustedDeviceCookie,
            isDeviceTrusted,
        } = await import("@/lib/trusted-devices");
        const tdCookie = request.cookies.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
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
            const { mintMfaChallengeToken } = await import("@/lib/mfa-utils");
            const oauthNext = request.cookies.get("oauth_next")?.value;
            const next = oauthNext || "/dashboard/oauth-apps";
            const mfaToken = await mintMfaChallengeToken(user.id, next);
            return NextResponse.redirect(
                new URL(
                    `/mfa?token=${encodeURIComponent(mfaToken)}`,
                    request.url,
                ),
            );
        }
    }

    const accessToken = await createAccessToken(
        user.id,
        email,
        provider.toLowerCase() as "google" | "github" | "discord" | "microsoft",
        parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10),
    );

    const refreshToken = await createRefreshTokenJWT(
        user.id,
        provider.toLowerCase() as "google" | "github" | "discord" | "microsoft",
    );

    try {
        const refreshTokenHash = await hashString(refreshToken);
        const { hashIpForSession, shortUaForSession } = await import(
            "@/lib/db"
        );
        await createRefreshToken(db, {
            id: generateUUID(),
            userId: user.id,
            tokenHash: refreshTokenHash,
            expiresAt: new Date(
                Date.now() +
                    parseInt(
                        process.env.REFRESH_TOKEN_EXPIRATION_DAYS || "30",
                        10,
                    ) *
                        24 *
                        60 *
                        60 *
                        1000,
            ),
            ipHash: await hashIpForSession(ipAddress || ""),
            uaShort: shortUaForSession(userAgent || ""),
        });

        await updateUserLastLogin(db, user.id);
        // Populate session-context columns on first sign-in via this
        // provider AND keep them fresh on every subsequent login. New
        // accounts created seconds earlier in this same handler get
        // their geo/device info backfilled here, so the users row
        // never sits with NULLs after a real sign-in.
        await updateUserSessionContext(
            db,
            user.id,
            deriveSessionContext(request),
        );

        await logAuditEvent(db, {
            id: generateUUID(),
            userId: user.id,
            eventType: "login_success",
            provider: provider.toLowerCase(),
            ipAddress,
            userAgent,
            status: "success",
        });
    } catch (dbError) {
        console.error("Failed to store tokens/audit log:", dbError);
    }

    // New-device alert (throttled per (user, IP, UA) in KV).
    try {
        const { notifyNewDeviceSignIn } = await import("@/lib/sign-in-alert");
        await notifyNewDeviceSignIn({
            userId: user.id,
            email: user.email || email,
            displayName: (user as any).display_name || null,
            ipAddress: ipAddress || "unknown",
            userAgent: userAgent || "unknown",
        });
    } catch {
        /* non-fatal */
    }

    // If there's a pending ?next= redirect (e.g. from OAuth authorize flow), use it
    const oauthNext = request.cookies.get("oauth_next")?.value;
    const intendedDest = oauthNext || "/dashboard/oauth-apps";
    // A username (handle) is mandatory. Until one is set, force /setup-name and
    // preserve the intended destination so the SSO flow resumes afterward.
    const needsUsername = !(user as { username?: string }).username;
    const redirectDest = needsUsername
        ? `/setup-name?next=${encodeURIComponent(intendedDest)}`
        : intendedDest;
    const response = NextResponse.redirect(new URL(redirectDest, request.url));

    const maxAge =
        parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10) * 60;
    const refreshMaxAge =
        parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || "30", 10) *
        24 *
        60 *
        60;
    const isProduction = process.env.NODE_ENV === "production";

    response.cookies.set("access_token", accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge,
        path: "/",
    });

    response.cookies.set("refresh_token", refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: refreshMaxAge,
        path: "/",
    });

    response.cookies.set("user_id", user.id, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        maxAge,
        path: "/",
    });

    await setAccountSessionsCookie(
        request,
        response,
        refreshToken,
        refreshMaxAge,
    );

    // Clear OAuth state cookies
    response.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    response.cookies.set("oauth_mode", "", { maxAge: 0, path: "/" });
    response.cookies.set("oauth_next", "", { maxAge: 0, path: "/" });

    return response;
}

/**
 * Exchange authorization code for provider tokens.
 */
async function exchangeCodeForTokens(
    code: string,
    config: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        tokenEndpoint: string;
    },
): Promise<{
    access_token: string;
    refresh_token?: string;
    id_token?: string;
} | null> {
    try {
        const body: Record<string, string> = {
            grant_type: "authorization_code",
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
        };

        const response = await fetch(config.tokenEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: new URLSearchParams(body).toString(),
        });

        if (!response.ok) {
            console.error(
                "Token endpoint error:",
                response.status,
                await response.text(),
            );
            return null;
        }

        return (await response.json()) as any;
    } catch (err) {
        console.error("Token exchange error:", err);
        return null;
    }
}

/**
 * Fetch and normalize user info from the OAuth provider.
 */
async function fetchUserInfoFromProvider(
    provider: string,
    accessToken: string,
    endpoint: string,
): Promise<{
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    login?: string;
} | null> {
    try {
        const response = await fetch(endpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            console.error("User info endpoint error:", response.status);
            return null;
        }

        const data: any = await response.json();

        switch (provider) {
            case "google":
                return {
                    sub: data.sub,
                    email: data.email,
                    name: data.name,
                    picture: data.picture,
                };

            case "microsoft": {
                // Microsoft Graph OIDC userinfo returns sub/name/email/
                // picture in standard shape. Work accounts sometimes
                // omit `email` and put the address in `preferred_username`
                // (or `upn`) instead — fall back through both.
                const msEmail =
                    data.email ||
                    data.preferred_username ||
                    data.upn ||
                    undefined;
                // `picture` from Graph is a URL that requires an
                // Authorization header to fetch the binary — useless as
                // an <img src>. Drop it; UI falls back to initials.
                return {
                    sub: String(data.sub),
                    email: msEmail,
                    name: data.name,
                };
            }

            case "discord": {
                // Discord returns: id (snowflake), username, global_name,
                // email, verified, avatar (hash or null). Refuse if the
                // account doesn't have a verified email — same bar as
                // Google/GitHub.
                if (data.email && data.verified !== true) {
                    console.error(
                        "[discord] rejecting unverified email for user %s",
                        String(data.id),
                    );
                    return null;
                }
                // Avatar: hash → CDN URL. Format auto: gif if animated
                // (avatar starts with "a_"), else png. Null avatar means
                // user is on the default avatar; we just leave picture
                // undefined and the UI shows initials.
                let avatarUrl: string | undefined;
                if (data.avatar && typeof data.avatar === "string") {
                    const ext = data.avatar.startsWith("a_") ? "gif" : "png";
                    avatarUrl = `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.${ext}`;
                }
                return {
                    sub: String(data.id),
                    email: data.email || undefined,
                    // global_name is the new display name (set 2023+);
                    // username is the @handle. Prefer global_name; fall
                    // back to username so older accounts still get a name.
                    name: data.global_name || data.username,
                    picture: avatarUrl,
                    login: data.username,
                };
            }

            case "github": {
                // The /user endpoint omits the email unless it's public. When it's
                // missing, fetch /user/emails and take the primary verified address.
                let githubEmail: string | null = data.email || null;
                if (!githubEmail) {
                    try {
                        const emailsRes = await fetch(
                            "https://api.github.com/user/emails",
                            {
                                headers: {
                                    Authorization: `Bearer ${accessToken}`,
                                    Accept: "application/vnd.github+json",
                                    "User-Agent": "accounts.elixpo",
                                },
                            },
                        );
                        if (emailsRes.ok) {
                            const emails: any[] = await emailsRes.json();
                            const primary = emails.find(
                                (e) => e.primary && e.verified,
                            );
                            const anyVerified = emails.find((e) => e.verified);
                            githubEmail =
                                primary?.email || anyVerified?.email || null;
                        }
                    } catch {
                        /* fall through — email stays null, caller blocks signup */
                    }
                }
                return {
                    sub: String(data.id),
                    email: githubEmail || undefined,
                    // GitHub `name` can be null — fall back to the login handle.
                    name: data.name || data.login,
                    picture: data.avatar_url,
                    login: data.login,
                };
            }

            default:
                return null;
        }
    } catch (err) {
        console.error("Fetch user info error:", err);
        return null;
    }
}
