export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";
import { sendMail } from "@/lib/mails";
import { hashBackupCode } from "@/lib/mfa-utils";
import { generateNumericOtp, generateUUID } from "@/lib/webcrypto";

const ENROLL_OTP_TTL_SECONDS = 10 * 60;
// Cloudflare KV's minimum expirationTtl is 60 seconds — values below
// that fail with HTTP 400. 60 is also a reasonable lower bound for a
// resend cooldown (faster than that and we're just inviting accidental
// double-clicks to spam the user's inbox).
const COOLDOWN_SECONDS = 60;

// Minimal UA summary just for the email body — same shape the sign-in
// alert uses, but inlined here to keep this route self-contained.
function shortUaForDisplay(ua: string): string {
    if (!ua) return "Account settings";
    let browser = "Unknown browser";
    if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("OPR/")) browser = "Opera";
    else if (ua.includes("Chrome/")) browser = "Chrome";
    else if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Safari/")) browser = "Safari";
    let os = "Unknown OS";
    if (/iPhone|iPad/.test(ua)) os = "iOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Linux/.test(ua)) os = "Linux";
    return `${browser} on ${os}`;
}

async function getAuth(request: NextRequest) {
    const token =
        request.cookies.get("access_token")?.value ||
        request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;
    const payload = await verifyJWT(token);
    if (payload?.type !== "access") return null;
    return payload;
}

/**
 * POST /api/auth/mfa/email-otp/enroll
 *
 * Start email-OTP enrollment. Creates an UNCONFIRMED factor row + mails
 * a 6-digit verification code to the user's account email. The factor
 * becomes usable only after /api/auth/mfa/email-otp/confirm validates
 * the code — same two-step ceremony as TOTP, so we prove the user
 * actually receives email at the registered address before treating it
 * as a 2FA method.
 *
 * Idempotent: a second call within the cooldown returns 429; outside
 * the cooldown it overwrites the pending OTP. Existing CONFIRMED rows
 * short-circuit to 200 — re-enrolling a confirmed email factor is a
 * no-op.
 */
export async function POST(request: NextRequest) {
    try {
        return await enrollImpl(request);
    } catch (err) {
        // Catch-all so unhandled throws (D1 schema drift, KV outage,
        // WebCrypto edge cases) surface as a readable JSON error instead
        // of an HTML 500 page. The client's toast can then show what
        // actually broke instead of a generic "HTTP 500".
        console.error(
            "[mfa email enroll] unhandled: %s",
            err instanceof Error ? err.stack || err.message : String(err),
        );
        // 424 not 500 — CF zone intercepts 5xx with an HTML error page,
        // which the client toast can't parse. 424 keeps the JSON body.
        return NextResponse.json(
            {
                error:
                    err instanceof Error
                        ? `Enrollment failed: ${err.message}`
                        : "Enrollment failed (unknown error)",
            },
            { status: 424 },
        );
    }
}

async function enrollImpl(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const user = (await db
        .prepare(
            "SELECT email, display_name, email_verified FROM users WHERE id = ?",
        )
        .bind(auth.sub)
        .first()) as {
        email: string;
        display_name: string | null;
        email_verified: number;
    } | null;
    if (!user)
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.email_verified) {
        return NextResponse.json(
            {
                error: "Verify your account email before enabling email OTP as a 2FA method.",
            },
            { status: 400 },
        );
    }

    // Already confirmed? Treat as success — but also clean up any
    // pending duplicate rows for this kind. The dashboard's factor list
    // would otherwise show a stale "pending confirmation" row alongside
    // the real confirmed factor, leaving the user stuck (clicking
    // Resend hits this branch and silently bails, never opening the
    // dialog). Sweeping the dupes here closes that loop.
    const existingConfirmed = (await db
        .prepare(
            `SELECT id FROM user_mfa_factors
             WHERE user_id = ? AND kind = 'email_otp'
                AND confirmed_at IS NOT NULL`,
        )
        .bind(auth.sub)
        .first()) as { id: string } | null;
    if (existingConfirmed) {
        await db
            .prepare(
                `DELETE FROM user_mfa_factors
                 WHERE user_id = ? AND kind = 'email_otp'
                    AND confirmed_at IS NULL`,
            )
            .bind(auth.sub)
            .run()
            .catch(() => {});
        return NextResponse.json({
            factor_id: existingConfirmed.id,
            already_confirmed: true,
        });
    }

    // Cooldown — keyed per user so two tabs / hot-reloads don't spam.
    // Guard the KV access: if the Pages project doesn't have a binding
    // named `KV`, return a structured 503 instead of letting the
    // undefined deref throw with a stack trace the client can't read.
    let kv: KVNamespace;
    try {
        kv = (getRequestContext().env as any).KV as KVNamespace;
        if (!kv) throw new Error("KV binding missing");
    } catch (err) {
        console.error(
            "[mfa email enroll] KV unavailable: %s",
            err instanceof Error ? err.message : String(err),
        );
        return NextResponse.json(
            {
                error: "Verification service unavailable. Please try again in a moment.",
            },
            { status: 424 },
        );
    }
    const cooldownKey = `mfa_email_enroll_cd:${auth.sub}`;
    const cooled = await kv.get(cooldownKey);
    if (cooled) {
        return NextResponse.json(
            {
                error: `Wait a moment before requesting another code (cooldown ${COOLDOWN_SECONDS}s).`,
            },
            { status: 429 },
        );
    }

    // Reuse an existing unconfirmed row if present so the user can
    // safely re-trigger enroll (e.g. didn't get the first email).
    let factorId: string;
    const existingPending = (await db
        .prepare(
            `SELECT id FROM user_mfa_factors
             WHERE user_id = ? AND kind = 'email_otp'
                AND confirmed_at IS NULL`,
        )
        .bind(auth.sub)
        .first()) as { id: string } | null;
    if (existingPending) {
        factorId = existingPending.id;
    } else {
        factorId = generateUUID();
        await db
            .prepare(
                `INSERT INTO user_mfa_factors
                    (id, user_id, kind, name)
                 VALUES (?, ?, 'email_otp', 'Email code')`,
            )
            .bind(factorId, auth.sub)
            .run();
    }

    // Generate + send. The plaintext OTP never touches D1 — only its
    // hash sits in KV so /confirm can match without storing the code.
    const otp = generateNumericOtp();
    const otpHash = await hashBackupCode(otp);
    await kv.put(`mfa_email_enroll:${auth.sub}`, otpHash, {
        expirationTtl: ENROLL_OTP_TTL_SECONDS,
    });
    await kv.put(cooldownKey, "1", { expirationTtl: COOLDOWN_SECONDS });

    // Dedicated mfa_email template — distinct from login_otp so the
    // messaging matches the actual intent ("you're enabling email as a
    // 2FA method", not "complete your sign-in"). Variables match what
    // the template declares: name, otp_code, expiry_minutes, device,
    // ip_address.
    const ipAddress =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("cf-connecting-ip") ||
        "unknown";
    const userAgent = request.headers.get("user-agent") || "";
    const device = shortUaForDisplay(userAgent);
    // Surface delivery failures so the user knows the inbox is empty —
    // the previous fire-and-forget pattern returned 200 even when mails
    // .elixpo rejected the request (bad hook key, bad signature, etc.),
    // leaving the user staring at a dialog with no email coming.
    const mailResult = await sendMail("mfa_email", user.email, {
        name: user.display_name || user.email.split("@")[0],
        otp_code: otp,
        expiry_minutes: Math.ceil(ENROLL_OTP_TTL_SECONDS / 60),
        device,
        ip_address: ipAddress,
    });
    if (!mailResult.ok) {
        // 424 Failed Dependency — see catch-all comment about CF zone
        // replacing 5xx bodies with HTML.
        return NextResponse.json(
            {
                error: `Couldn't send the verification email: ${mailResult.error ?? "unknown"}`,
            },
            { status: 424 },
        );
    }

    return NextResponse.json({
        factor_id: factorId,
        expires_in: ENROLL_OTP_TTL_SECONDS,
        sent_to: user.email,
        delivery_id: mailResult.delivery_id,
    });
}
