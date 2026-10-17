export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { sendMail } from "@/lib/mails";
import { generateNumericOtp, generateUUID } from "@/lib/webcrypto";

/**
 * POST /api/auth/send-verification
 * Send a verification OTP to the authenticated user's email
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

        const db = await getDatabase();

        // Check if already verified
        const user = (await db
            .prepare(
                "SELECT email, email_verified, display_name FROM users WHERE id = ?",
            )
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

        // Rate limit: max 1 email per 60 seconds
        const recent = (await db
            .prepare(
                "SELECT created_at FROM email_verification_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
            )
            .bind(payload.sub)
            .first()) as any;

        if (recent?.created_at) {
            const lastSent = new Date(recent.created_at).getTime();
            const cooldown = 60 * 1000; // 60 seconds
            if (Date.now() - lastSent < cooldown) {
                const wait = Math.ceil(
                    (cooldown - (Date.now() - lastSent)) / 1000,
                );
                return NextResponse.json(
                    {
                        error: `Please wait ${wait} seconds before requesting another code`,
                    },
                    { status: 429 },
                );
            }
        }

        // Generate OTP and verification token
        const otp = generateNumericOtp();
        const verificationToken = generateUUID();
        const expiryMinutes = parseInt(
            process.env.EMAIL_VERIFICATION_OTP_EXPIRY_MINUTES || "10",
            10,
        );
        const expiresAt = new Date(
            Date.now() + expiryMinutes * 60 * 1000,
        ).toISOString();

        // Clean up old tokens for this user
        await db
            .prepare("DELETE FROM email_verification_tokens WHERE user_id = ?")
            .bind(payload.sub)
            .run();

        // Store new token
        await db
            .prepare(
                "INSERT INTO email_verification_tokens (id, user_id, email, otp_code, verification_token, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(
                generateUUID(),
                payload.sub,
                user.email,
                otp,
                verificationToken,
                expiresAt,
            )
            .run();

        // Send OTP email with one-click verify link
        const recipientName = user.display_name || user.email.split("@")[0];
        const APP_URL =
            process.env.NEXT_PUBLIC_APP_URL || "https://accounts.elixpo.com";
        const verifyLink = `${APP_URL}/verify?token=${verificationToken}`;
        const mailResult = await sendMail("user_verify_otp", user.email, {
            name: recipientName,
            otp_code: otp,
            expiry_minutes: expiryMinutes,
            verify_link: verifyLink,
        });

        // sendMail returns ok:false on misconfig / signature failure /
        // upstream non-2xx WITHOUT throwing — caller must inspect to
        // surface the real failure to the client. Without this branch,
        // the user clicks "Resend code", we return 200, and they wait
        // for an email that never arrives.
        if (!mailResult.ok) {
            console.error(
                "[Verification] sendMail returned ok=false for %s: %s",
                user.email,
                mailResult.error ?? "unknown",
            );
            return NextResponse.json(
                {
                    error:
                        mailResult.error ??
                        "Couldn't send the verification email. Try again in a moment.",
                },
                { status: 502 },
            );
        }

        console.log(
            "[Verification] OTP sent to %s (delivery_id=%s)",
            user.email,
            mailResult.delivery_id ?? "",
        );

        return NextResponse.json({
            message: "Verification code sent to your email",
            expiresIn: expiryMinutes * 60,
        });
    } catch (error) {
        console.error("[Verification] Send error:", error);
        return NextResponse.json(
            { error: "Failed to send verification email" },
            { status: 500 },
        );
    }
}
