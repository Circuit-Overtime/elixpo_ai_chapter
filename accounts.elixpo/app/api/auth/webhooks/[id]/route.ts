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

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const db = await getDatabase();
    const webhook = (await db
        .prepare(`SELECT * FROM webhooks WHERE id = ? AND user_id = ?`)
        .bind(id, auth.sub)
        .first()) as any;

    if (!webhook)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
        ...webhook,
        events:
            typeof webhook.events === "string"
                ? JSON.parse(webhook.events)
                : (webhook.events ?? []),
        is_active: Boolean(webhook.is_active),
    });
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const db = await getDatabase();

    const existing = await db
        .prepare(`SELECT id FROM webhooks WHERE id = ? AND user_id = ?`)
        .bind(id, auth.sub)
        .first();
    if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body: any = await request.json();
    const { url, events, is_active } = body as {
        url?: string;
        events?: string[];
        is_active?: boolean;
    };

    const fields: string[] = ["updated_at = CURRENT_TIMESTAMP"];
    const values: any[] = [];

    if (url !== undefined) {
        if (!url.startsWith("https://")) {
            return NextResponse.json(
                { error: "Webhook URL must use HTTPS" },
                { status: 400 },
            );
        }
        fields.push("url = ?");
        values.push(url);
    }
    if (events !== undefined) {
        fields.push("events = ?");
        values.push(JSON.stringify(events));
    }
    if (is_active !== undefined) {
        fields.push("is_active = ?");
        values.push(is_active ? 1 : 0);
    }

    values.push(id, auth.sub);
    await db
        .prepare(
            `UPDATE webhooks SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
        )
        .bind(...values)
        .run();

    const updated = (await db
        .prepare(`SELECT * FROM webhooks WHERE id = ?`)
        .bind(id)
        .first()) as any;

    return NextResponse.json({
        ...updated,
        events:
            typeof updated.events === "string"
                ? JSON.parse(updated.events)
                : (updated.events ?? []),
        is_active: Boolean(updated.is_active),
    });
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const db = await getDatabase();

    const existing = await db
        .prepare(`SELECT id FROM webhooks WHERE id = ? AND user_id = ?`)
        .bind(id, auth.sub)
        .first();
    if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db
        .prepare(`DELETE FROM webhooks WHERE id = ? AND user_id = ?`)
        .bind(id, auth.sub)
        .run();

    return NextResponse.json({ success: true });
}
