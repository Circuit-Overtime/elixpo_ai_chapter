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

async function hmacSign(secret: string, payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function POST(
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

    const payload = JSON.stringify({
        event: "ping",
        timestamp: new Date().toISOString(),
        data: { message: "Test delivery from Elixpo Accounts" },
    });

    const signature = await hmacSign(webhook.secret, payload);

    try {
        const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Elixpo-Event": "ping",
                "X-Elixpo-Signature": `sha256=${signature}`,
                "X-Elixpo-Delivery": crypto.randomUUID(),
            },
            body: payload,
        });

        await db
            .prepare(
                `UPDATE webhooks SET last_delivery_at = CURRENT_TIMESTAMP WHERE id = ?`,
            )
            .bind(id)
            .run();

        return NextResponse.json({
            success: response.ok,
            statusCode: response.status,
            message: response.ok
                ? "Test delivery succeeded"
                : `Remote returned ${response.status}`,
        });
    } catch (err: any) {
        return NextResponse.json({
            success: false,
            statusCode: 0,
            message: err?.message || "Failed to deliver test payload",
        });
    }
}
