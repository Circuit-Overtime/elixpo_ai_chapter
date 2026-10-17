export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";

/**
 * POST /api/auth/verify-email
 * Verify email using OTP code
 * Body: { code: "123456" }
 */
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get("access_token")?.value;
        if (!token)
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );

        const payload = await verifyJWT(token);
        if (!payload)
            return NextResponse.json(
                { error: "Invalid token" },
                { status: 401 },
            );

        const body: any = await request.json();
        const { code } = body;

        if (!code || typeof code !== "string" || code.length !== 6) {
            return NextResponse.json(
                { error: "A 6-digit verification code is required" },
                { status: 400 },
            );
        }

        const db = await getDatabase();

        // Check if already verified
        const user = (await db
            .prepare("SELECT email_verified FROM users WHERE id = ?")
            .bind(payload.sub)
            .first()) as any;
        if (!user)
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 },
            );
        if (user.email_verified)
            return NextResponse.json(
                { error: "Email is already verified" },
                { status: 400 },
            );

        // Find valid OTP
        const record = (await db
            .prepare(
                "SELECT id, otp_code, expires_at, is_verified FROM email_verification_tokens WHERE user_id = ? AND otp_code = ? ORDER BY created_at DESC LIMIT 1",
            )
            .bind(payload.sub, code)
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

        // Mark user email as verified
        await db
            .prepare(
                "UPDATE users SET email_verified = 1, email_verified_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(payload.sub)
            .run();

        // Clean up all verification tokens for this user
        await db
            .prepare("DELETE FROM email_verification_tokens WHERE user_id = ?")
            .bind(payload.sub)
            .run();

        console.log("[Verification] Email verified for user: %s", payload.sub);

        return NextResponse.json({
            message: "Email verified successfully",
            verified: true,
        });
    } catch (error) {
        console.error("[Verification] Verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify email" },
            { status: 500 },
        );
    }
}
