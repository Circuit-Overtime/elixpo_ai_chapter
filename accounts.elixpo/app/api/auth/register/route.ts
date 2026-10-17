export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { setAccountSessionsCookie } from "@/lib/account-sessions";
import { getDatabase } from "@/lib/d1-client";
import {
    createIdentity,
    createUser,
    getIdentitiesByUserId,
    getUserByEmail,
    logAuditEvent,
    createRefreshToken as storeRefreshToken,
} from "@/lib/db";
import { createAccessToken, createRefreshToken } from "@/lib/jwt";
import { sendMail } from "@/lib/mails";
import { hashPassword } from "@/lib/password";
import { generateRandomDisplayName } from "@/lib/random-name";
import { createRegisterRateLimiter } from "@/lib/rate-limit";
import { generateUUID, hashString } from "@/lib/webcrypto";

/**
 * POST /api/auth/register
 *
 * Register a new user with email/password
 * Or accept OAuth provider registration
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "securepassword", // optional for OAuth
 *   "provider": "google|github|email",
 *   "provider_id": "oauth_provider_user_id" // for OAuth
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body: any = await request.json();
        const { email, password, provider, provider_id, provider_email } = body;

        // Get request metadata for audit log
        const ipAddress =
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
            request.headers.get("cf-connecting-ip") ||
            "unknown";
        const userAgent = request.headers.get("user-agent") || "unknown";

        // Get D1 database connection
        const db = await getDatabase();

        // Rate limiting: 5 registration attempts per IP per minute
        try {
            const rateLimiter = createRegisterRateLimiter();
            const rateLimit = await rateLimiter.check(
                db,
                ipAddress,
                "register",
            );
            if (!rateLimit.allowed) {
                console.warn(
                    `[Register] Rate limit exceeded for IP: ${ipAddress}. Retry after ${rateLimit.retryAfter}s`,
                );
                return NextResponse.json(
                    {
                        error: "Too many registration attempts. Please try again later.",
                        retryAfter: rateLimit.retryAfter,
                    },
                    {
                        status: 429,
                        headers: {
                            "Retry-After": (
                                rateLimit.retryAfter || 1800
                            ).toString(),
                        },
                    },
                );
            }
        } catch (rateLimitError) {
            console.error("[Register] Rate limit check error:", rateLimitError);
            // Fail open - allow request if DB is unavailable
        }

        // Validate required fields
        if (!email || !provider) {
            return NextResponse.json(
                { error: "email and provider are required" },
                { status: 400 },
            );
        }

        // For email/password, require password
        if (provider === "email" && !password) {
            return NextResponse.json(
                { error: "password is required for email provider" },
                { status: 400 },
            );
        }

        // Check if email is already registered
        try {
            const existingUser = await getUserByEmail(db, email);
            if (existingUser) {
                // Email already exists - check what providers they have
                const identitiesResult = await getIdentitiesByUserId(
                    db,
                    (existingUser as any).id,
                );
                const identities: any[] =
                    (identitiesResult as any)?.results || [];
                const existingProviders = identities.map(
                    (id: any) => id.provider,
                );

                return NextResponse.json(
                    {
                        error: "Email is already registered",
                        message: `This email is registered with: ${existingProviders.join(", ")}`,
                        existingProviders,
                    },
                    { status: 409 },
                );
            }
        } catch (error) {
            console.error("[Register] Duplicate email check error:", error);
            // Continue anyway
        }

        // Create new user
        const userId = generateUUID();

        // For email/password provider
        if (provider === "email") {
            // Hash password
            const passwordHash = await hashPassword(password);
            const displayName = generateRandomDisplayName();

            // Create user in D1
            try {
                await createUser(db, {
                    id: userId,
                    email,
                    passwordHash,
                    displayName,
                });

                // Create identity
                await createIdentity(db, {
                    id: generateUUID(),
                    userId,
                    provider: "email",
                    providerUserId: email, // Use email as unique identifier
                    providerEmail: email,
                });

                // Log audit event
                await logAuditEvent(db, {
                    id: generateUUID(),
                    userId,
                    eventType: "registration",
                    provider: "email",
                    status: "success",
                    ipAddress,
                    userAgent,
                });

                // Send verification OTP email (fire-and-forget)
                try {
                    const { generateNumericOtp } = await import(
                        "@/lib/webcrypto"
                    );
                    const otpCode = generateNumericOtp();
                    const expiryMinutes = parseInt(
                        process.env.EMAIL_VERIFICATION_OTP_EXPIRY_MINUTES ||
                            "10",
                        10,
                    );
                    const expiresAt = new Date(
                        Date.now() + expiryMinutes * 60 * 1000,
                    ).toISOString();

                    const verificationToken = generateUUID();
                    await db
                        .prepare(
                            "INSERT INTO email_verification_tokens (id, user_id, email, otp_code, verification_token, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
                        )
                        .bind(
                            generateUUID(),
                            userId,
                            email,
                            otpCode,
                            verificationToken,
                            expiresAt,
                        )
                        .run();

                    const APP_URL =
                        process.env.NEXT_PUBLIC_APP_URL ||
                        "https://accounts.elixpo.com";
                    const verifyLink = `${APP_URL}/verify?token=${verificationToken}`;
                    const mailResult = await sendMail(
                        "user_verify_otp",
                        email,
                        {
                            name: displayName,
                            otp_code: otpCode,
                            expiry_minutes: 10,
                            verify_link: verifyLink,
                        },
                    );
                    // sendMail returns `{ok: false}` for env / signature /
                    // upstream-4xx failures WITHOUT throwing. We must
                    // inspect the result explicitly — otherwise the
                    // try/catch never fires and we never know the mail
                    // didn't go out. The buyer gets stuck at "check your
                    // inbox" with nothing arriving.
                    if (!mailResult.ok) {
                        console.error(
                            "[Register] sendMail returned ok=false for %s: %s",
                            email,
                            mailResult.error ?? "unknown",
                        );
                    } else {
                        console.log(
                            "[Register] Verification OTP sent to %s (delivery_id=%s)",
                            email,
                            mailResult.delivery_id ?? "",
                        );
                    }
                } catch (otpError) {
                    console.error(
                        "[Register] Failed to send verification email (threw): %s",
                        otpError instanceof Error
                            ? otpError.message
                            : String(otpError),
                    );
                    // Non-critical — user can request again from profile
                }
            } catch (dbError) {
                console.error("[Register] Database error:", dbError);
                // Continue anyway - tokens are still valid
            }
        }
        // For OAuth providers
        else if (provider === "google" || provider === "github") {
            if (!provider_id) {
                return NextResponse.json(
                    {
                        error: `${provider}_id is required for ${provider} provider`,
                    },
                    { status: 400 },
                );
            }

            // Create user in D1
            try {
                await createUser(db, {
                    id: userId,
                    email: email || `${provider}_${provider_id}@elixpo.local`,
                });

                // Create identity
                await createIdentity(db, {
                    id: generateUUID(),
                    userId,
                    provider,
                    providerUserId: provider_id,
                    providerEmail: provider_email || email,
                });

                // Log audit event
                await logAuditEvent(db, {
                    id: generateUUID(),
                    userId,
                    eventType: "registration",
                    provider,
                    status: "success",
                    ipAddress,
                    userAgent,
                });
            } catch (dbError) {
                console.error("[Register] Database error:", dbError);
                // Continue anyway - tokens are still valid
            }
        } else {
            return NextResponse.json(
                { error: `unsupported provider: ${provider}` },
                { status: 400 },
            );
        }

        // Create tokens
        const accessToken = await createAccessToken(
            userId,
            email,
            provider as any,
        );
        const refreshTokenJWT = await createRefreshToken(
            userId,
            provider as any,
        );

        // Store refresh token in database
        try {
            const refreshTokenHash = await hashString(refreshTokenJWT);
            await storeRefreshToken(db, {
                id: generateUUID(),
                userId,
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
            });
        } catch (dbError) {
            console.error("[Register] Token storage error:", dbError);
            // Continue anyway - tokens are still valid
        }

        // Return response with tokens
        const response = NextResponse.json({
            user: {
                id: userId,
                email,
                provider,
            },
            tokens: {
                access_token: accessToken,
                refresh_token: refreshTokenJWT,
                expires_in:
                    parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10) *
                    60,
                token_type: "Bearer",
            },
            // Signal frontend to show display name setup for email/password signups
            ...(provider === "email" && { needsDisplayName: true }),
        });

        // Set secure cookies
        const maxAge =
            parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10) * 60;
        response.cookies.set("access_token", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge,
            path: "/",
        });

        response.cookies.set("refresh_token", refreshTokenJWT, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge:
                parseInt(
                    process.env.REFRESH_TOKEN_EXPIRATION_DAYS || "30",
                    10,
                ) *
                24 *
                60 *
                60,
            path: "/",
        });

        response.cookies.set("user_id", userId, {
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge,
            path: "/",
        });

        await setAccountSessionsCookie(
            request,
            response,
            refreshTokenJWT,
            parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || "30", 10) *
                24 *
                60 *
                60,
        );

        return response;
    } catch (error) {
        console.error("[Registration] Error:", error);
        return NextResponse.json(
            { error: "Registration failed" },
            { status: 500 },
        );
    }
}
