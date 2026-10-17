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

export async function GET(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await getDatabase();
    const result = await db
        .prepare(
            `SELECT id, url, events, is_active, created_at, last_delivery_at
       FROM webhooks WHERE user_id = ? ORDER BY created_at DESC`,
        )
        .bind(auth.sub)
        .all();

    const webhooks = (result.results || []).map((w: any) => ({
        ...w,
        events:
            typeof w.events === "string"
                ? JSON.parse(w.events)
                : (w.events ?? []),
        is_active: Boolean(w.is_active),
    }));

    return NextResponse.json({ webhooks });
}

export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: any = await request.json();
    const { endpoint_id, events, secret } = body as {
        endpoint_id: string;
        events: string[];
        secret?: string;
    };

    // Per the safety policy, a user-scoped webhook must target a specific
    // webhook endpoint registered on one of the caller's own OAuth apps.
    // Apps can now have multiple endpoints (e.g. localhost + production),
    // so the caller picks which one. The URL is resolved server-side from
    // the endpoint row — never trusted from the request body.
    if (!endpoint_id || typeof endpoint_id !== "string") {
        return NextResponse.json(
            { error: "endpoint_id is required" },
            { status: 400 },
        );
    }
    if (!events || events.length === 0) {
        return NextResponse.json(
            { error: "At least one event is required" },
            { status: 400 },
        );
    }

    const db = await getDatabase();
    const endpoint = await db
        .prepare(
            `SELECT e.id, e.url, e.client_id, c.name AS app_name, c.owner_id
             FROM oauth_client_webhook_endpoints e
             JOIN oauth_clients c ON c.client_id = e.client_id
             WHERE e.id = ? AND c.is_active = 1 AND e.is_active = 1`,
        )
        .bind(endpoint_id)
        .first<{
            id: string;
            url: string;
            client_id: string;
            app_name: string;
            owner_id: string;
        }>();

    if (!endpoint)
        return NextResponse.json(
            { error: "Endpoint not found or inactive" },
            { status: 404 },
        );
    if (endpoint.owner_id !== auth.sub) {
        return NextResponse.json(
            {
                error: "You can only target webhook endpoints on OAuth apps you own",
            },
            { status: 403 },
        );
    }

    const id = crypto.randomUUID();
    const webhookSecret = secret || crypto.randomUUID().replace(/-/g, "");

    await db
        .prepare(
            `INSERT INTO webhooks (id, user_id, client_id, endpoint_id, url, events, secret, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .bind(
            id,
            auth.sub,
            endpoint.client_id,
            endpoint.id,
            endpoint.url,
            JSON.stringify(events),
            webhookSecret,
        )
        .run();

    return NextResponse.json(
        {
            id,
            client_id: endpoint.client_id,
            client_name: endpoint.app_name,
            endpoint_id: endpoint.id,
            url: endpoint.url,
            events,
            secret: webhookSecret,
            is_active: true,
        },
        { status: 201 },
    );
}
