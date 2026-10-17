export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { hashPassword } from "@/lib/password";

/**
 * POST /api/auth/reset-password
 * Verify OTP and set new password (no auth required).
 * Body: { email, code, newPassword }
 *
 * Also accepts { token } to look up the OTP by verification_token
 * (from the email button link) — returns the code so the UI can auto-fill.
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            email?: string;
            code?: string;
            newPassword?: string;
            token?: string;
        };

        const db = await getDatabase();

        // --- Token lookup mode (email button click) ---
        if (body.token && !body.code) {
            const record = (await db
                .prepare(
                    "SELECT otp_code, email, expires_at, is_verified FROM email_verification_tokens WHERE verification_token = ? AND email LIKE 'reset:%'",
                )
                .bind(body.token)
                .first()) as any;

            if (!record) {
                return NextResponse.json(
                    { error: "Invalid or expired link" },
                    { status: 400 },
                );
            }
            if (new Date(record.expires_at) < new Date()) {
                return NextResponse.json(
                    {
                        error: "This link has expired. Please request a new code.",
                    },
                    { status: 400 },
                );
            }
            if (record.is_verified) {
                return NextResponse.json(
                    { error: "This code has already been used" },
                    { status: 400 },
                );
            }

            // Return the OTP and real email so the UI can auto-fill
            const realEmail = record.email.replace("reset:", "");
            return NextResponse.json({
                code: record.otp_code,
                email: realEmail,
            });
        }

        // --- Full reset mode ---
        const { email, code, newPassword } = body;

        if (!email || !code || !newPassword) {
            return NextResponse.json(
                { error: "email, code, and newPassword are required" },
                { status: 400 },
            );
        }

        if (newPassword.length < 8) {
            return NextResponse.json(
                { error: "Password must be at least 8 characters" },
                { status: 400 },
            );
        }

        // Look up user
        const user = (await db
            .prepare("SELECT id FROM users WHERE email = ?")
            .bind(email)
            .first()) as any;

        if (!user) {
            return NextResponse.json(
                { error: "Invalid email or code" },
                { status: 400 },
            );
        }

        // Verify OTP
        const record = (await db
            .prepare(
                "SELECT id, otp_code, expires_at, is_verified FROM email_verification_tokens WHERE user_id = ? AND email = ? AND otp_code = ? ORDER BY created_at DESC LIMIT 1",
            )
            .bind(user.id, `reset:${email}`, code)
            .first()) as any;

        if (!record) {
            return NextResponse.json(
                { error: "Invalid verification code" },
                { status: 400 },
            );
        }
        if (record.is_verified) {
            return NextResponse.json(
                { error: "This code has already been used" },
                { status: 400 },
            );
        }
        if (new Date(record.expires_at) < new Date()) {
            return NextResponse.json(
                {
                    error: "Verification code has expired. Please request a new one.",
                },
                { status: 400 },
            );
        }

        // Mark token as used
        await db
            .prepare(
                "UPDATE email_verification_tokens SET is_verified = 1, verified_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(record.id)
            .run();

        // Update password
        const passwordHash = await hashPassword(newPassword);
        await db
            .prepare(
                "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(passwordHash, user.id)
            .run();

        // Clean up all reset tokens for this user
        await db
            .prepare(
                "DELETE FROM email_verification_tokens WHERE user_id = ? AND email LIKE 'reset:%'",
            )
            .bind(user.id)
            .run();

        console.log("[ResetPassword] Password reset for user: %s", user.id);

        return NextResponse.json({
            message: "Password has been reset successfully",
        });
    } catch (error) {
        console.error("[ResetPassword] Error:", error);
        return NextResponse.json(
            { error: "Failed to reset password" },
            { status: 500 },
        );
    }
}
