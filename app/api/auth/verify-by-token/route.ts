export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";

/**
 * GET /api/auth/verify-by-token?token=<verification_token>
 * Looks up an email verification OTP by its verification_token (from email button).
 * Returns the OTP code so the verify page can auto-submit it.
 */
export async function GET(request: NextRequest) {
    try {
        const token = request.nextUrl.searchParams.get("token");
        if (!token) {
            return NextResponse.json(
                { error: "token is required" },
                { status: 400 },
            );
        }

        const db = await getDatabase();

        const record = (await db
            .prepare(
                "SELECT otp_code, user_id, email, expires_at, is_verified FROM email_verification_tokens WHERE verification_token = ? AND email NOT LIKE 'reset:%'",
            )
            .bind(token)
            .first()) as any;

        if (!record) {
            return NextResponse.json(
                { error: "Invalid or expired verification link" },
                { status: 400 },
            );
        }

        if (record.is_verified) {
            return NextResponse.json(
                {
                    error: "This link has already been used",
                    alreadyVerified: true,
                },
                { status: 400 },
            );
        }

        if (new Date(record.expires_at) < new Date()) {
            return NextResponse.json(
                {
                    error: "This verification link has expired. Please request a new code.",
                },
                { status: 400 },
            );
        }

        return NextResponse.json({
            code: record.otp_code,
            email: record.email,
        });
    } catch (error) {
        console.error("[VerifyByToken] Error:", error);
        return NextResponse.json(
            { error: "Failed to process verification" },
            { status: 500 },
        );
    }
}
