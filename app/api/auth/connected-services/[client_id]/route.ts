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
 * GET /api/auth/connected-services/[client_id]
 *
 * Returns per-app stats for a service the caller has authorized. 404s if
 * the caller has no relationship with the app (no refresh_tokens row),
 * keeping app metadata private from probing.
 *
 * Stats returned:
 *   - App basics (name, description, homepage, logo, scopes)
 *   - first_authorized / last_authorized timestamps
 *   - active_sessions     — refresh_tokens.revoked = 0
 *   - total_sign_ins      — count of audit_logs entries for this app/user
 *   - sign_in_timeline    — array of { date, count } over the last 30 days
 *
 * Surfaces the user's relationship with the app, not the app's internals
 * (no DB introspection, no admin-only fields).
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

    // Single round-trip with batch — avoids sequential network hops.
    // total_sign_ins is derived from refresh_tokens count (one row per
    // authorization grant), which is accurate per-app. audit_logs.provider
    // stores the IdP (google/github), not client_id, so it's not usable here.
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [appRow, tokens, timeline] = await db.batch([
        db
            .prepare(
                `SELECT client_id, name, description, homepage_url, logo_url, scopes
                 FROM oauth_clients
                 WHERE client_id = ? AND is_active = 1`,
            )
            .bind(client_id),
        db
            .prepare(
                `SELECT
                    COUNT(*) AS total_sign_ins,
                    SUM(CASE WHEN revoked = 0 THEN 1 ELSE 0 END) AS active_sessions,
                    MIN(created_at) AS first_authorized,
                    MAX(created_at) AS last_authorized
                 FROM refresh_tokens
                 WHERE user_id = ? AND client_id = ?`,
            )
            .bind(auth.sub, client_id),
        db
            .prepare(
                `SELECT DATE(created_at) AS date, COUNT(*) AS count
                 FROM refresh_tokens
                 WHERE user_id = ? AND client_id = ? AND created_at >= ?
                 GROUP BY DATE(created_at)
                 ORDER BY date`,
            )
            .bind(auth.sub, client_id, since),
    ]);

    const app = (appRow.results || [])[0] as
        | {
              client_id: string;
              name: string;
              description: string | null;
              homepage_url: string | null;
              logo_url: string | null;
              scopes: string | null;
          }
        | undefined;
    const tokenStats = (tokens.results || [])[0] as
        | {
              total_sign_ins: number;
              active_sessions: number;
              first_authorized: string | null;
              last_authorized: string | null;
          }
        | undefined;

    if (!app) {
        return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    // Privacy guard: if the user has never authorized this app, don't
    // leak its existence. 404 instead of a 403 so we don't tell scanners
    // whether a client_id is valid.
    if (!tokenStats?.first_authorized) {
        return NextResponse.json({ error: "Not connected" }, { status: 404 });
    }

    let scopes: string[] = [];
    if (app.scopes) {
        try {
            scopes = JSON.parse(app.scopes);
            if (!Array.isArray(scopes)) scopes = [];
        } catch {
            /* leave empty */
        }
    }

    return NextResponse.json({
        client_id: app.client_id,
        name: app.name,
        description: app.description,
        homepage_url: app.homepage_url,
        logo_url: app.logo_url,
        scopes,
        first_authorized: tokenStats.first_authorized,
        last_authorized: tokenStats.last_authorized,
        active_sessions: tokenStats.active_sessions ?? 0,
        total_sign_ins: tokenStats.total_sign_ins ?? 0,
        sign_in_timeline: (timeline.results || []) as Array<{
            date: string;
            count: number;
        }>,
    });
}
