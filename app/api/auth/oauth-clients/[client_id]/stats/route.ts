export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { tierFromUserRow } from "@/lib/billing";
import {
    isPlatformHomepage,
    requiresBrandingVerification,
} from "@/lib/branding-gate";
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
 * GET /api/auth/oauth-clients/[client_id]/stats
 *
 * Owner-only stats panel for an OAuth app the caller owns. Returns
 * aggregate user activity (no per-user data) and webhook delivery status.
 *
 * 403s if the caller isn't the app owner — distinct from the user-facing
 * /api/auth/connected-services/[client_id], which gates on the caller
 * being authorized to the app, not owning it.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { client_id } = await params;
    const db = await getDatabase();

    const app = await db
        .prepare(
            `SELECT oc.client_id, oc.owner_id, oc.request_count, oc.last_used,
                    oc.created_at, oc.homepage_url, oc.is_branding_verified,
                    u.tier, u.is_internal
             FROM oauth_clients oc
             JOIN users u ON u.id = oc.owner_id
             WHERE oc.client_id = ? AND oc.is_active = 1`,
        )
        .bind(client_id)
        .first<{
            client_id: string;
            owner_id: string;
            request_count: number | null;
            last_used: string | null;
            created_at: string;
            tier: string | null;
            is_internal: number;
            is_branding_verified: number;
            homepage_url: string | null;
        }>();

    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (app.owner_id !== auth.sub)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ownerTier = tierFromUserRow(app);
    const canExportLifetime = ownerTier !== "hobby";
    if (request.nextUrl.searchParams.get("export") === "csv") {
        if (!canExportLifetime) {
            return NextResponse.json(
                { error: "Lifetime CSV export requires a paid plan" },
                { status: 402 },
            );
        }
        const exportRows = await db
            .prepare(
                `SELECT DATE(created_at) AS date,
                        COUNT(*) AS sign_ins,
                        COUNT(DISTINCT user_id) AS unique_users
                 FROM refresh_tokens
                 WHERE client_id = ? AND parent_token_hash IS NULL
                 GROUP BY DATE(created_at)
                 ORDER BY date`,
            )
            .bind(client_id)
            .all<{
                date: string;
                sign_ins: number;
                unique_users: number;
            }>();
        const csv = [
            "date,sign_ins,unique_users",
            ...(exportRows.results || []).map(
                (row) => `${row.date},${row.sign_ins},${row.unique_users}`,
            ),
        ].join("\n");
        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${client_id}-activity.csv"`,
                "Cache-Control": "private, no-store",
            },
        });
    }

    const requestedDays = Number.parseInt(
        request.nextUrl.searchParams.get("days") || "30",
        10,
    );
    const days = [7, 30, 60, 90].includes(requestedDays) ? requestedDays : 30;

    // Configurable 7–90 day window for the chart. SQLite's DATE() truncates the ISO
    // string to YYYY-MM-DD so the GROUP BY collapses cleanly per day.
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [aggregate, timeline, endpoints] = await db.batch([
        db
            .prepare(
                `SELECT
                    SUM(CASE WHEN parent_token_hash IS NULL THEN 1 ELSE 0 END) AS total_sign_ins,
                    COUNT(DISTINCT user_id) AS unique_users,
                    SUM(CASE WHEN revoked = 0 THEN 1 ELSE 0 END) AS active_sessions
                 FROM refresh_tokens
                 WHERE client_id = ?`,
            )
            .bind(client_id),
        db
            .prepare(
                `SELECT DATE(created_at) AS date, COUNT(*) AS count
                 FROM refresh_tokens
                 WHERE client_id = ?
                   AND parent_token_hash IS NULL
                   AND created_at >= ?
                 GROUP BY DATE(created_at)
                 ORDER BY date`,
            )
            .bind(client_id, since),
        db
            .prepare(
                `SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
                    MAX(last_delivery_at) AS last_delivery_at
                 FROM oauth_client_webhook_endpoints
                 WHERE client_id = ?`,
            )
            .bind(client_id),
    ]);

    const agg = (aggregate.results || [])[0] as
        | {
              total_sign_ins: number;
              unique_users: number;
              active_sessions: number;
          }
        | undefined;
    const ep = (endpoints.results || [])[0] as
        | {
              total: number;
              active: number;
              last_delivery_at: string | null;
          }
        | undefined;

    return NextResponse.json({
        client_id: app.client_id,
        created_at: app.created_at,
        request_count: app.request_count ?? 0,
        last_used: app.last_used,
        total_sign_ins: agg?.total_sign_ins ?? 0,
        unique_users: agg?.unique_users ?? 0,
        active_sessions: agg?.active_sessions ?? 0,
        timeline_days: days,
        can_export_lifetime: canExportLifetime,
        branding_verification_required: requiresBrandingVerification(
            agg?.total_sign_ins ?? 0,
            app.is_branding_verified === 1,
            isPlatformHomepage(app.homepage_url),
        ),
        sign_in_timeline: (timeline.results || []) as Array<{
            date: string;
            count: number;
        }>,
        webhooks: {
            total_endpoints: ep?.total ?? 0,
            active_endpoints: ep?.active ?? 0,
            last_delivery_at: ep?.last_delivery_at ?? null,
        },
    });
}
