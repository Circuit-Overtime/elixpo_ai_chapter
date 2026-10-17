// Outbound "account revoked / deleted" webhooks to first-party apps.
//
// When a user revokes an app (Connected Services) or deletes their account,
// accounts.elixpo notifies the app so it can purge the user's data. Currently
// configured for LixBlogs. See blogs.elixpo issue #8.
//
// Signing matches the blogs receiver (lib/hmac.js): the body is signed with
// hex(HMAC-SHA256(JSON.stringify(payload), secret)) and sent with
// X-Webhook-Signature / X-Webhook-Event / X-Webhook-Timestamp headers.

export type RevocationEvent = "user.deleted" | "app.revoked";

interface RevocationTarget {
    url: string;
    secret: string;
}

// Resolve a client's revocation webhook config from env. Only first-party apps
// are wired up; everything else returns null (no webhook fired).
function getRevocationTarget(clientId: string): RevocationTarget | null {
    const blogsClientId = process.env.BLOGS_CLIENT_ID;
    const url = process.env.BLOGS_REVOKE_WEBHOOK_URL;
    const secret = process.env.BLOGS_REVOKE_WEBHOOK_SECRET;
    if (blogsClientId && clientId === blogsClientId && url && secret) {
        return { url, secret };
    }
    return null;
}

async function hmacHex(payload: string, secret: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Fire a revocation webhook to a single app. Best-effort: never throws, so a
 * webhook failure can't block account deletion / revocation. Returns whether a
 * webhook was sent successfully.
 */
export async function fireRevocationWebhook(
    clientId: string,
    userId: string,
    event: RevocationEvent,
): Promise<boolean> {
    const target = getRevocationTarget(clientId);
    if (!target) return false;

    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
        event,
        user_id: userId,
        client_id: clientId,
        timestamp,
    });

    try {
        const signature = await hmacHex(payload, target.secret);
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(target.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-Event": event,
                "X-Webhook-Timestamp": timestamp,
            },
            body: payload,
            signal: controller.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
            console.error(
                "[revocation-webhook] %s -> %s",
                clientId,
                String(res.status),
            );
            return false;
        }
        return true;
    } catch (err) {
        console.error("[revocation-webhook] delivery failed:", err);
        return false;
    }
}

/**
 * Fire revocation webhooks to every connected app (for full account deletion).
 * `clientIds` should be the distinct client_ids the user had tokens for.
 */
export async function fireRevocationToAll(
    clientIds: string[],
    userId: string,
    event: RevocationEvent,
): Promise<void> {
    await Promise.all(
        Array.from(new Set(clientIds)).map((cid) =>
            fireRevocationWebhook(cid, userId, event),
        ),
    );
}
