export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { sendMail } from "@/lib/mails";
import { createPasswordResetRateLimiter } from "@/lib/rate-limit";
import { generateNumericOtp, generateUUID } from "@/lib/webcrypto";

/**
 * POST /api/auth/forgot-password
 * Send a password-reset OTP to the given email (no auth required).
 * Body: { email: "user@example.com" }
 */
export async function POST(request: NextRequest) {
    try {
        const { email } = (await request.json()) as { email?: string };

        if (!email?.includes("@")) {
            return NextResponse.json(
                { error: "A valid email address is required" },
                { status: 400 },
            );
        }

        const db = await getDatabase();
        const ipAddress =
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
            request.headers.get("cf-connecting-ip") ||
            "unknown";

        const rateLimiter = createPasswordResetRateLimiter();
        const rateLimit = await rateLimiter.check(
            db,
            ipAddress,
            "forgot-password",
        );
        if (!rateLimit.allowed) {
            return NextResponse.json(
                {
                    error: "Too many requests. Please try again later.",
                    retryAfter: rateLimit.retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimit.retryAfter || 3600),
                    },
                },
            );
        }

        // Look up user — always return success to avoid user enumeration
        const user = (await db
            .prepare(
                "SELECT id, email, password_hash, display_name FROM users WHERE email = ?",
            )
            .bind(email)
            .first()) as any;

        if (!user?.password_hash) {
            // Don't reveal whether the email exists
            return NextResponse.json({
                message:
                    "If that email is registered, a reset code has been sent.",
            });
        }

        // Rate limit: 1 email per 60 seconds
        const recent = (await db
            .prepare(
                "SELECT created_at FROM email_verification_tokens WHERE user_id = ? AND email = ? ORDER BY created_at DESC LIMIT 1",
            )
            .bind(user.id, `reset:${email}`)
            .first()) as any;

        if (recent?.created_at) {
            const elapsed = Date.now() - new Date(recent.created_at).getTime();
            if (elapsed < 60_000) {
                const wait = Math.ceil((60_000 - elapsed) / 1000);
                return NextResponse.json(
                    {
                        error: `Please wait ${wait} seconds before requesting another code`,
                    },
                    { status: 429 },
                );
            }
        }

        const otp = generateNumericOtp();
        const tokenId = generateUUID();
        const verificationToken = generateUUID();
        const expiryMinutes = 10;
        const expiresAt = new Date(
            Date.now() + expiryMinutes * 60 * 1000,
        ).toISOString();

        // Clean up old reset tokens for this user
        await db
            .prepare(
                "DELETE FROM email_verification_tokens WHERE user_id = ? AND email LIKE 'reset:%'",
            )
            .bind(user.id)
            .run();

        // Store new token — use `reset:<email>` in the email column to distinguish from verification tokens
        await db
            .prepare(
                "INSERT INTO email_verification_tokens (id, user_id, email, otp_code, verification_token, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(
                tokenId,
                user.id,
                `reset:${email}`,
                otp,
                verificationToken,
                expiresAt,
            )
            .run();

        const recipientName = user.display_name || email.split("@")[0];
        await sendMail("password_reset", email, {
            name: recipientName,
            otp_code: otp,
            expiry_minutes: expiryMinutes,
        });

        console.log("[ForgotPassword] OTP sent to %s", email);

        return NextResponse.json({
            message: "If that email is registered, a reset code has been sent.",
        });
    } catch (error) {
        console.error("[ForgotPassword] Error:", error);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 },
        );
    }
}
