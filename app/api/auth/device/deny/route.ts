export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { logAuditEvent } from "@/lib/db";
import { denyDeviceAuthorization } from "@/lib/device-auth-service";
import { verifyJWT } from "@/lib/jwt";
import { generateUUID } from "@/lib/webcrypto";

// Auth pattern copied verbatim from app/api/auth/oauth-clients/[client_id]/route.ts —
// httpOnly, sameSite=lax access_token cookie + verifyJWT(). No separate CSRF
// token exists in this codebase; the cookie policy is the CSRF mitigation.
export async function POST(request: NextRequest) {
    const token = request.cookies.get("access_token")?.value;
    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyJWT(token);
    if (payload?.type !== "access") {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    let body: { user_code?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description: "Malformed JSON body",
            },
            { status: 400 },
        );
    }

    if (
        typeof body.user_code !== "string" ||
        body.user_code.trim().length === 0
    ) {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description: "user_code is required",
            },
            { status: 400 },
        );
    }

    // Same IP/user-agent extraction as app/api/auth/mfa/challenge/verify/route.ts,
    // used below for the audit log entry.
    const ipAddress =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("cf-connecting-ip") ||
        "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // payload.sub is the user id — per the oauth-clients precedent, not
    // payload.id or payload.userId. user_id is never accepted from the
    // request body: a client-supplied user_id would let anyone deny (or,
    // in the approve route, approve) a grant on someone else's behalf.
    const db = await getDatabase();
    const result = await denyDeviceAuthorization(db, {
        userCode: body.user_code,
        userId: payload.sub,
    });

    if (!result.ok) {
        // not_found and expired collapse to the same 404 shape as
        // GET /api/auth/device/lookup, for the same anti-enumeration
        // reason: don't let this endpoint become an oracle either.
        const status = result.reason === "already_resolved" ? 409 : 404;
        return NextResponse.json(
            {
                error: result.reason,
                error_description:
                    "This code is invalid, expired, or already resolved.",
            },
            { status },
        );
    }

    // Audit trail — accounts.elixpo#80. status: "failure" here mirrors
    // mfa.challenge_failed's convention of `status` tracking whether the
    // underlying security action succeeded, not whether the code path ran
    // without error — a user declining a device request is the
    // authorization failing to complete, not a successful "deny action".
    // Flagged as a judgment call in the absence of an exact precedent for
    // "user explicitly declines"; easy to flip to "success" if that's not
    // the convention this team wants.
    await logAuditEvent(db, {
        id: generateUUID(),
        userId: payload.sub,
        eventType: "device.denied",
        provider: result.clientId,
        ipAddress,
        userAgent,
        status: "failure",
    }).catch(() => {});

    return NextResponse.json({ ok: true }, { status: 200 });
}
