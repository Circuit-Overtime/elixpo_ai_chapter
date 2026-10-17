export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import {
    getUserNotificationPreferences,
    upsertUserNotificationPreferences,
} from "@/lib/db";
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

export async function GET(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const prefs = (await getUserNotificationPreferences(db, auth.sub)) as any;

    return NextResponse.json({
        email_login_alerts: prefs?.email_login_alerts ?? true,
        email_app_activity: prefs?.email_app_activity ?? false,
        email_weekly_digest: prefs?.email_weekly_digest ?? false,
        email_security_alerts: prefs?.email_security_alerts ?? true,
    });
}

export async function PUT(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: any = await request.json();
    const db = await getDatabase();

    await upsertUserNotificationPreferences(db, auth.sub, {
        email_login_alerts: body.email_login_alerts,
        email_app_activity: body.email_app_activity,
        email_weekly_digest: body.email_weekly_digest,
        email_security_alerts: body.email_security_alerts,
    });

    const prefs = (await getUserNotificationPreferences(db, auth.sub)) as any;
    return NextResponse.json({
        email_login_alerts: prefs?.email_login_alerts ?? true,
        email_app_activity: prefs?.email_app_activity ?? false,
        email_weekly_digest: prefs?.email_weekly_digest ?? false,
        email_security_alerts: prefs?.email_security_alerts ?? true,
    });
}
