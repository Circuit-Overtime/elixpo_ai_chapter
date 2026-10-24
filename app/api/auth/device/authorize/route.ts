export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getBrandingGate } from "@/lib/branding-gate";
import { getDatabase } from "@/lib/d1-client";
import {
    cleanupExpiredDeviceAuthorizations,
    createDeviceAuthorization,
    DeviceAuthorizationRequestError,
} from "@/lib/device-auth-service";
import { checkDeviceIssuanceRateLimit } from "@/lib/rate-limit-middleware";

/**
 * POST /api/auth/device/authorize
 *
 * RFC 8628 Device Authorization Grant — issuance endpoint. Public clients
 * (no client secret) call this to start a CLI/headless login. See
 * accounts.elixpo#79.
 *
 * Request body:
 * {
 *   "client_id": "cli_xxxxx",
 *   "scope": "lixblogs:blog:read lixblogs:blog:write" // optional, space-delimited
 * }
 *
 * Response (RFC 8628 §3.2):
 * {
 *   "device_code": "...",              // shown once, never logged again
 *   "user_code": "WDJB-MJHT",
 *   "verification_uri": "https://accounts.elixpo.com/device",
 *   "verification_uri_complete": "https://accounts.elixpo.com/device?user_code=WDJB-MJHT",
 *   "expires_in": 600,
 *   "interval": 2
 * }
 */
export async function POST(request: NextRequest) {
    const ipAddress =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("cf-connecting-ip") ||
        "unknown";

    const db = await getDatabase();

    const rateLimit = await checkDeviceIssuanceRateLimit(db, ipAddress);
    if (!rateLimit.allowed) {
        return NextResponse.json(
            {
                error: "slow_down",
                error_description: "Too many device authorization requests",
            },
            {
                status: 429,
                headers: rateLimit.retryAfter
                    ? { "Retry-After": rateLimit.retryAfter.toString() }
                    : undefined,
            },
        );
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description: "Request body must be valid JSON",
            },
            { status: 400 },
        );
    }

    const { client_id, scope, audience } = body ?? {};

    if (!client_id || typeof client_id !== "string") {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description: "client_id is required",
            },
            { status: 400 },
        );
    }

    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://accounts.elixpo.com";

    try {
        const brandingGate = await getBrandingGate(db, client_id);
        if (brandingGate.verificationRequired) {
            return NextResponse.json(
                {
                    error: "invalid_client",
                    error_description:
                        "This application must verify its brand before accepting more sign-ins.",
                },
                { status: 403 },
            );
        }
        const result = await createDeviceAuthorization(db, {
            clientId: client_id,
            scope: typeof scope === "string" ? scope : undefined,
            audience: typeof audience === "string" ? audience : undefined,
            ipAddress,
            appUrl,
        });

        // Best-effort, bounded, fire-and-forget — never blocks issuance on
        // the cleanup query. A dedicated cron (see /api/cron/cleanup-device-codes)
        // is the primary mechanism; this just keeps things bounded between runs.
        cleanupExpiredDeviceAuthorizations(db, 50).catch(() => {
            /* best-effort */
        });

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        if (error instanceof DeviceAuthorizationRequestError) {
            const status = error.code === "server_error" ? 500 : 400;
            return NextResponse.json(
                { error: error.code, error_description: error.message },
                { status },
            );
        }

        console.error("[Device Authorize] Unexpected error:", error);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: "Failed to issue device authorization",
            },
            { status: 500 },
        );
    }
}
