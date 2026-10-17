export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { getEnv } from "@/lib/env";
import { redeliverById } from "@/lib/send-pipeline";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /v1/internal/redeliver — server-to-server only.
 *
 * The SMTP-sender Worker is the Cloudflare Queue consumer (Pages can't consume
 * queues). When it drains a retry job it calls back here with the delivery id;
 * we rebuild the whole send from the delivery row and re-attempt it, reusing the
 * exact same pipeline as the first attempt (no logic is duplicated in the
 * Worker). Auth is the shared SMTP_SENDER_SECRET the Worker already holds.
 *
 * Body: { "deliveryId": "dlv_…", "final"?: boolean }
 *   final=true is the dead-letter path: retries are exhausted, just mark failed.
 *
 * Response: { ok, status: "sent"|"queued"|"failed", retryable } — the Worker
 * acks on retryable=false and retries (CF Queue backoff) on retryable=true.
 */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function POST(request: NextRequest) {
    const secret = await getEnv("SMTP_SENDER_SECRET");
    if (!secret) {
        return NextResponse.json({ ok: false, error: "sender_misconfigured" }, { status: 500 });
    }
    if (!timingSafeEqual(request.headers.get("x-sender-secret") || "", secret)) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const deliveryId = typeof body?.deliveryId === "string" ? body.deliveryId : "";
    if (!deliveryId) {
        return NextResponse.json({ ok: false, error: "missing_delivery_id" }, { status: 400 });
    }

    const db = await getDatabase();
    const result = await redeliverById(db, deliveryId, { final: body?.final === true });
    return NextResponse.json(result, { status: 200 });
}
