export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { lookupDeviceAuthorizationByUserCode } from "@/lib/device-auth-service";
import { checkDeviceLookupRateLimit } from "@/lib/rate-limit-middleware";

/**
 * GET /api/auth/device/lookup?user_code=WDJB-MJHT
 *
 * Read-only resolution of a user-entered device code. Used by the
 * verification page (accounts.elixpo#79's UI counterpart, tracked
 * separately) to render "app X wants Y scopes" before the user approves or
 * denies. Approval/denial themselves are a separate, session-authenticated,
 * CSRF-protected action and are not implemented here.
 *
 * user_code is never echoed back, logged, or stored beyond this request —
 * only its hash is compared against what's in D1.
 */
export async function GET(request: NextRequest) {
    const ipAddress =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("cf-connecting-ip") ||
        "unknown";

    const db = await getDatabase();

    const rateLimit = await checkDeviceLookupRateLimit(db, ipAddress);
    if (!rateLimit.allowed) {
        return NextResponse.json(
            {
                error: "slow_down",
                error_description: "Too many verification attempts",
            },
            {
                status: 429,
                headers: rateLimit.retryAfter
                    ? { "Retry-After": rateLimit.retryAfter.toString() }
                    : undefined,
            },
        );
    }

    const userCode = request.nextUrl.searchParams.get("user_code");
    if (!userCode) {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description: "user_code is required",
            },
            { status: 400 },
        );
    }

    try {
        const result = await lookupDeviceAuthorizationByUserCode(db, userCode);

        if (result.status === "not_found") {
            // Same shape as an expired code — don't let a client distinguish
            // "never existed" from "existed and expired".
            return NextResponse.json({ status: "expired" }, { status: 404 });
        }

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        console.error("[Device Lookup] Unexpected error:", error);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: "Failed to resolve device code",
            },
            { status: 500 },
        );
    }
}
