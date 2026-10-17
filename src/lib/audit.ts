/**
 * Append-only audit log of admin WRITE actions, stored in `admin-cache` KV.
 * Every mutating action (D1 writes, KV edits, redeploys, etc. — Phase 3) routes
 * through recordAction(). Read back, newest-first, on the Audit page.
 *
 * Keys are `audit:<descending-ts>:<rand>` so a prefix list returns newest-first.
 */

import { randomToken } from "./crypto";
import { getKV } from "./kv";
import type { SessionData } from "./session";

const PREFIX = "audit:";
const RETENTION_SECONDS = 90 * 24 * 60 * 60; // 90 days

export interface AuditEntry {
    ts: number;
    actor: string; // email
    actorId: string; // uid
    action: string; // e.g. "d1.query", "kv.put", "pages.redeploy"
    target?: string; // resource id / name
    meta?: Record<string, unknown>;
}

export async function recordAction(
    session: Pick<SessionData, "email" | "uid">,
    action: string,
    target?: string,
    meta?: Record<string, unknown>,
): Promise<void> {
    const ts = Date.now();
    const entry: AuditEntry = {
        ts,
        actor: session.email,
        actorId: session.uid,
        action,
        target,
        meta,
    };
    // Descending timestamp prefix → KV list (ascending) yields newest-first.
    const descending = (Number.MAX_SAFE_INTEGER - ts)
        .toString()
        .padStart(16, "0");
    const key = `${PREFIX}${descending}:${randomToken(6)}`;
    const kv = await getKV();
    await kv.put(key, JSON.stringify(entry), {
        expirationTtl: RETENTION_SECONDS,
    });
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
    const kv = await getKV();
    const { keys } = await kv.list({ prefix: PREFIX, limit });
    const entries = await Promise.all(
        keys.map(async (k) => {
            const raw = await kv.get(k.name);
            if (!raw) return null;
            try {
                return JSON.parse(raw) as AuditEntry;
            } catch {
                return null;
            }
        }),
    );
    return entries.filter((e): e is AuditEntry => e !== null);
}
