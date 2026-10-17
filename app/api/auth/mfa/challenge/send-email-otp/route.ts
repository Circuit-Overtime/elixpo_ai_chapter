export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { sendMail } from "@/lib/mails";
import { verifyMfaChallengeToken } from "@/lib/mfa-utils";

const OTP_TTL_SECONDS = 5 * 60;
// Cloudflare KV's minimum expirationTtl is 60 seconds — anything lower
// fails with HTTP 400. Bumping accordingly; also a reasonable floor for
// a login-OTP resend cooldown.
const COOLDOWN_SECONDS = 60;

/**
 * POST /api/auth/mfa/challenge/send-email-otp
 *
 * Used during a login challenge (after first factor passed) — generates
 * a 6-digit OTP, stores its hash in KV bound to the mfaToken, and emails
 * the user. The /verify endpoint reads the same KV entry to validate.
 *
 * Throttled: one send per 30 seconds per mfaToken.
 *
 * Body: { mfaToken, device?, ipAddress? }  (device/ip echoed into the
 * email body so the user can spot a phishing attempt).
 */
export async function POST(request: NextRequest) {
    try {
        return await sendImpl(request);
    } catch (err) {
        // Catch-all so unhandled throws (KV outage, mails.elixpo network
        // failure, getRequestContext misconfig) surface as a readable
        // JSON error instead of a Cloudflare edge HTML 502 page that the
        // client toast can't parse.
        console.error(
            "[mfa challenge send-email-otp] unhandled: %s",
            err instanceof Error ? err.stack || err.message : String(err),
        );
        // 424 instead of 500 — see comment in the mail-failure branch
        // about CF zone intercepting 5xx with an HTML error page.
        return NextResponse.json(
            {
                error:
                    err instanceof Error
                        ? `Couldn't send code: ${err.message}`
                        : "Couldn't send code (unknown error)",
            },
            { status: 424 },
        );
    }
}

async function sendImpl(request: NextRequest) {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const mfaToken = body?.mfaToken;
    if (typeof mfaToken !== "string") {
        return NextResponse.json(
            { error: "mfaToken is required" },
            { status: 400 },
        );
    }

    const challenge = await verifyMfaChallengeToken(mfaToken);
    if (!challenge) {
        return NextResponse.json(
            { error: "mfaToken is invalid or expired" },
            { status: 401 },
        );
    }

    const db = await getDatabase();
    const user = (await db
        .prepare("SELECT email, display_name FROM users WHERE id = ?")
        .bind(challenge.userId)
        .first()) as { email: string; display_name: string | null } | null;
    if (!user)
        return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Confirm email_otp is actually one of the user's enrolled factors.
    const enrolled = (await db
        .prepare(
            `SELECT id FROM user_mfa_factors
             WHERE user_id = ? AND kind = 'email_otp'
                AND confirmed_at IS NOT NULL`,
        )
        .bind(challenge.userId)
        .first()) as { id: string } | null;
    if (!enrolled) {
        return NextResponse.json(
            { error: "Email OTP is not enabled on this account" },
            { status: 400 },
        );
    }

    let kv: KVNamespace;
    try {
        kv = (getRequestContext().env as any).KV as KVNamespace;
        if (!kv) throw new Error("KV binding missing");
    } catch (err) {
        console.error(
            "[mfa challenge send-email-otp] KV unavailable: %s",
            err instanceof Error ? err.message : String(err),
        );
        return NextResponse.json(
            {
                error: "Verification service unavailable. Please try again in a moment.",
            },
            { status: 424 },
        );
    }
    const cooldownKey = `mfa_email_otp_cd:${mfaToken.slice(-32)}`;
    const cooled = await kv.get(cooldownKey);
    if (cooled) {
        return NextResponse.json(
            {
                error: `Please wait before requesting another code (cooldown ${COOLDOWN_SECONDS}s).`,
            },
            { status: 429 },
        );
    }

    // Shared unbiased OTP helper (rejection sampling, no modulo). See
    // generateNumericOtp() for the math. Lazy-imported to avoid a hard
    // dependency on lib/webcrypto from edge-runtime modules above.
    const { generateNumericOtp } = await import("@/lib/webcrypto");
    const code = generateNumericOtp();

    // Store the OTP keyed to this mfaToken so /verify can fetch + match it.
    // Last 32 chars of the token are enough entropy to namespace per-attempt.
    await kv.put(`mfa_email_otp:${mfaToken.slice(-32)}`, code, {
        expirationTtl: OTP_TTL_SECONDS,
    });
    await kv.put(cooldownKey, "1", { expirationTtl: COOLDOWN_SECONDS });

    const device =
        typeof body?.device === "string" ? body.device : "Unknown device";
    const ipAddress =
        typeof body?.ipAddress === "string" ? body.ipAddress : "unknown";

    // Surface delivery failures (mails.elixpo signature mismatch,
    // missing hook key, network error, etc.) instead of returning 200
    // with sent:true while the inbox stays empty — same pattern as the
    // enrollment route.
    const mailResult = await sendMail("login_otp", user.email, {
        name: user.display_name || user.email.split("@")[0],
        otp_code: code,
        expiry_minutes: Math.ceil(OTP_TTL_SECONDS / 60),
        device,
        ip_address: ipAddress,
    });
    if (!mailResult.ok) {
        // Burn the KV entries so the user can retry immediately without
        // hitting the cooldown — the failed attempt shouldn't penalize
        // them.
        await kv.delete(`mfa_email_otp:${mfaToken.slice(-32)}`).catch(() => {});
        await kv.delete(cooldownKey).catch(() => {});
        // 424 Failed Dependency — upstream mail provider failed. We
        // return 4xx (not 5xx) because the elixpo.com Cloudflare zone
        // intercepts 5xx responses and replaces the JSON body with its
        // own HTML error page, which the client toast can't parse.
        return NextResponse.json(
            {
                error: `Couldn't send the verification email: ${mailResult.error ?? "unknown"}`,
            },
            { status: 424 },
        );
    }

    return NextResponse.json({
        sent: true,
        expires_in: OTP_TTL_SECONDS,
        delivery_id: mailResult.delivery_id,
    });
}
