export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";

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
 * POST /api/billing/cancel
 *
 * Cancel the authenticated user's recurring subscription via payouts.elixpo.
 *
 * Graceful: cancel_at_cycle_end=true (default) — the user keeps access
 * through the period they already paid for, then auto-downgrades to hobby
 * when the entitlement expires on payouts.elixpo's side. The
 * `entitlement.updated` webhook back to us drives the actual tier flip
 * and the cancellation email; we don't mutate users.tier here.
 *
 * Body: { immediate?: boolean }
 *   immediate=false (default) — graceful, keeps access through period.
 *   immediate=true            — hard cancel, entitlement expires now.
 *                               Currently disabled in the UI; admin-only.
 */
export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: any = {};
    try {
        body = await request.json();
    } catch {
        /* body is optional */
    }
    const immediate = body?.immediate === true;

    const db = await getDatabase();
    const user = (await db
        .prepare("SELECT id, tier, is_internal FROM users WHERE id = ?")
        .bind(auth.sub)
        .first()) as { id: string; tier: string; is_internal: number } | null;
    if (!user)
        return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (user.is_internal) {
        return NextResponse.json(
            { error: "Internal accounts don't have a subscription to cancel." },
            { status: 400 },
        );
    }
    if (user.tier === "hobby") {
        return NextResponse.json(
            { error: "You're on the free Hobby tier — nothing to cancel." },
            { status: 400 },
        );
    }

    const apiBase =
        process.env.PAYOUTS_API_BASE || "https://payouts.elixpo.com";
    const apiKey = process.env.ELIXPO_ACCOUNTS_PAYOUT_CLIENT_SECRET || "";
    if (!apiKey) {
        console.error(
            "[billing cancel] ELIXPO_ACCOUNTS_PAYOUT_CLIENT_SECRET not set",
        );
        return NextResponse.json(
            { error: "Billing is not configured. Try again later." },
            { status: 503 },
        );
    }

    let resp: Response;
    try {
        resp = await fetch(`${apiBase}/v1/subscriptions/cancel`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                customer: { uid: user.id },
                cancel_at_cycle_end: !immediate,
            }),
        });
    } catch (err) {
        console.error(
            "[billing cancel] payouts unreachable: %s",
            err instanceof Error ? err.message : String(err),
        );
        return NextResponse.json(
            { error: "Couldn't reach the billing service. Try again." },
            { status: 424 },
        );
    }

    const text = await resp.text();
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text.slice(0, 500) };
    }

    if (!resp.ok) {
        console.error(
            "[billing cancel] payouts error status=%s err=%s",
            String(resp.status),
            data?.error_description || data?.error || "unknown",
        );
        return NextResponse.json(
            {
                error:
                    data?.error_description ||
                    data?.error ||
                    `Cancel failed (HTTP ${resp.status})`,
            },
            { status: 424 },
        );
    }

    // Successful cancel call. The entitlement.updated webhook will arrive
    // shortly with status='cancelled' (graceful) and active=true; that's
    // what flips the dashboard state and fires the confirmation email.
    return NextResponse.json({
        ok: true,
        status: data.status,
        cancel_at_cycle_end: data.cancel_at_cycle_end,
        access_until: data.current_period_end,
    });
}
