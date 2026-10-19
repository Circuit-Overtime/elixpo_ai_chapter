/**
 * Client for the SMTP sender Worker (workers/smtp-sender). Pages edge routes
 * can't open TCP, so the actual SMTP send is delegated to that Worker over
 * HTTP with a shared secret. Used by the sender send-test now, and by the
 * Queue-consumer send path later.
 */

import { getEnv } from "./env";

export interface RelayAttachment {
    filename: string;
    contentType: string;
    contentBase64: string;
}

export interface RelayRequest {
    host: string;
    port: number;
    secure: string; // 'tls' | 'starttls'
    user: string;
    pass: string;
    from: string;
    fromName?: string | null;
    to: string;
    subject?: string;
    html?: string;
    text?: string;
    attachments?: RelayAttachment[];
    /** Per-recipient unsubscribe URL → List-Unsubscribe + one-click POST headers. */
    listUnsubscribe?: string | null;
}

export interface RelayResult {
    ok: boolean;
    response?: string;
    error?: string;
    transcript?: string[];
}

export async function relayViaSender(req: RelayRequest): Promise<RelayResult> {
    const base = await getEnv("SMTP_SENDER_URL");
    const secret = await getEnv("SMTP_SENDER_SECRET");
    if (!base || !secret) {
        return {
            ok: false,
            error: "The SMTP sender service is not configured (SMTP_SENDER_URL / SMTP_SENDER_SECRET).",
        };
    }

    try {
        const res = await fetch(`${base.replace(/\/$/, "")}/send`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-sender-secret": secret },
            body: JSON.stringify(req),
        });
        const data = (await res.json().catch(() => ({}))) as RelayResult;
        if (!res.ok && data?.error == null) {
            return { ok: false, error: `sender service error (${res.status})` };
        }
        return data;
    } catch (e: any) {
        return { ok: false, error: `could not reach sender service: ${e?.message || e}` };
    }
}
