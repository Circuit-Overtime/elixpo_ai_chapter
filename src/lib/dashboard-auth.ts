/**
 * Shared guard for dashboard API routes. Resolves the session and the caller's
 * merchant, and provides a helper to assert ownership of a given app so a
 * merchant can never read or mutate another tenant's data.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "./d1-client";
import { getSession, type SessionData } from "./session";

export interface DashboardCtx {
    db: D1Database;
    session: SessionData;
    merchantId: string;
}

export async function requireDashboard(
    request: NextRequest,
): Promise<DashboardCtx | NextResponse> {
    const session = await getSession(request);
    if (!session) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const db = await getDatabase();
    return { db, session, merchantId: session.merchantId };
}

/** Returns the app row if it belongs to the merchant, else null. */
export async function merchantOwnsApp(
    db: D1Database,
    merchantId: string,
    appId: string,
): Promise<any | null> {
    return db
        .prepare("SELECT * FROM apps WHERE id = ? AND merchant_id = ?")
        .bind(appId, merchantId)
        .first();
}
