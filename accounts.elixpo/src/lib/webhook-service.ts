/**
 * Webhook Management Service
 * Handles webhook registration, delivery, and event management
 */

import crypto from "crypto";
import { getDatabase } from "./d1-client";

export type WebhookEvent =
    | "user.created"
    | "user.updated"
    | "user.deleted"
    | "auth.login_success"
    | "auth.login_failed"
    | "auth.password_changed"
    | "auth.email_verified"
    | "oauth.app_created"
    | "oauth.app_deleted"
    | "api_key.created"
    | "api_key.revoked"
    | "api_key.rate_limited";

export interface Webhook {
    id: string;
    userId: string;
    url: string;
    events: WebhookEvent[];
    secret: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    lastTriggeredAt?: string;
}

export interface WebhookDelivery {
    id: string;
    webhookId: string;
    event: WebhookEvent;
    payload: Record<string, any>;
    statusCode?: number;
    attemptCount: number;
    success: boolean;
    errorMessage?: string;
    createdAt: string;
}

/**
 * Create a new webhook
 */
export async function createWebhook(
    userId: string,
    url: string,
    events: WebhookEvent[],
): Promise<Webhook | null> {
    const db = await getDatabase();
    const id = `wh_${crypto.randomUUID()}`;
    const secret = crypto.randomBytes(32).toString("hex");
    const now = new Date().toISOString();

    try {
        await db
            .prepare(
                `INSERT INTO webhooks (id, user_id, url, events, secret, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
            )
            .bind(id, userId, url, JSON.stringify(events), secret, now, now)
            .run();

        return {
            id,
            userId,
            url,
            events,
            secret,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        };
    } catch (error) {
        console.error("Error creating webhook:", error);
        return null;
    }
}

/**
 * Get user's webhooks
 */
export async function getUserWebhooks(userId: string): Promise<Webhook[]> {
    const db = await getDatabase();

    try {
        const response = await db
            .prepare(
                "SELECT * FROM webhooks WHERE user_id = ? ORDER BY created_at DESC",
            )
            .bind(userId)
            .all();

        const results = (response as any).results || response;

        return results.map((row: any) => ({
            id: row.id,
            userId: row.user_id,
            url: row.url,
            events: JSON.parse(row.events),
            secret: row.secret,
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastTriggeredAt: row.last_triggered_at,
        }));
    } catch (error) {
        console.error("Error fetching webhooks:", error);
        return [];
    }
}

/**
 * Get a specific webhook
 */
export async function getWebhook(
    webhookId: string,
    userId?: string,
): Promise<Webhook | null> {
    const db = await getDatabase();

    try {
        const result = (await db
            .prepare(
                userId
                    ? "SELECT * FROM webhooks WHERE id = ? AND user_id = ?"
                    : "SELECT * FROM webhooks WHERE id = ?",
            )
            .bind(...(userId ? [webhookId, userId] : [webhookId]))
            .first()) as any;

        if (!result) return null;

        return {
            id: result.id,
            userId: result.user_id,
            url: result.url,
            events: JSON.parse(result.events),
            secret: result.secret,
            isActive: Boolean(result.is_active),
            createdAt: result.created_at,
            updatedAt: result.updated_at,
            lastTriggeredAt: result.last_triggered_at,
        };
    } catch (error) {
        console.error("Error fetching webhook:", error);
        return null;
    }
}

/**
 * Update webhook
 */
export async function updateWebhook(
    webhookId: string,
    userId: string,
    url?: string,
    events?: WebhookEvent[],
    isActive?: boolean,
): Promise<Webhook | null> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    try {
        const updates: string[] = [];
        const values: any[] = [];

        if (url !== undefined) {
            updates.push("url = ?");
            values.push(url);
        }
        if (events !== undefined) {
            updates.push("events = ?");
            values.push(JSON.stringify(events));
        }
        if (isActive !== undefined) {
            updates.push("is_active = ?");
            values.push(isActive ? 1 : 0);
        }

        if (updates.length === 0) return getWebhook(webhookId, userId);

        updates.push("updated_at = ?");
        values.push(now);
        values.push(webhookId);
        values.push(userId);

        await db
            .prepare(
                `UPDATE webhooks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
            )
            .bind(...values)
            .run();

        return getWebhook(webhookId, userId);
    } catch (error) {
        console.error("Error updating webhook:", error);
        return null;
    }
}

/**
 * Delete webhook
 */
export async function deleteWebhook(
    webhookId: string,
    userId: string,
): Promise<boolean> {
    const db = await getDatabase();

    try {
        const result = await db
            .prepare("DELETE FROM webhooks WHERE id = ? AND user_id = ?")
            .bind(webhookId, userId)
            .run();

        return (result.meta?.changes || 0) > 0;
    } catch (error) {
        console.error("Error deleting webhook:", error);
        return false;
    }
}

/**
 * Get webhooks for an event
 */
export async function getWebhooksForEvent(
    event: WebhookEvent,
): Promise<Webhook[]> {
    const db = await getDatabase();

    try {
        const response = await db
            .prepare(
                `SELECT * FROM webhooks 
        WHERE is_active = 1 AND events LIKE ? 
        ORDER BY created_at DESC`,
            )
            .bind(`%"${event}"%`)
            .all();

        const results = (response as any).results || response;

        return results.map((row: any) => ({
            id: row.id,
            userId: row.user_id,
            url: row.url,
            events: JSON.parse(row.events),
            secret: row.secret,
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastTriggeredAt: row.last_triggered_at,
        }));
    } catch (error) {
        console.error("Error fetching webhooks for event:", error);
        return [];
    }
}

/**
 * Trigger a webhook event
 */
export async function triggerWebhookEvent(
    event: WebhookEvent,
    payload: Record<string, any>,
    userId?: string,
): Promise<void> {
    const _db = await getDatabase();

    try {
        // Get webhooks for this event
        let webhooks = await getWebhooksForEvent(event);

        // Filter by user if specified
        if (userId) {
            webhooks = webhooks.filter((w) => w.userId === userId);
        }

        // Trigger each webhook
        for (const webhook of webhooks) {
            await deliverWebhook(webhook, event, payload);
        }
    } catch (error) {
        console.error("Error triggering webhook event:", error);
    }
}

/**
 * Deliver webhook payload
 */
export async function deliverWebhook(
    webhook: Webhook,
    event: WebhookEvent,
    payload: Record<string, any>,
    attemptCount: number = 1,
): Promise<WebhookDelivery | null> {
    const db = await getDatabase();
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Create HMAC signature for verification
    const signature = createWebhookSignature(
        JSON.stringify(payload),
        webhook.secret,
    );

    try {
        // Attempt delivery
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-Event": event,
                "X-Webhook-Timestamp": timestamp,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        const success = response.ok;
        const errorMessage = success ? null : `HTTP ${response.status}`;

        // Log delivery
        await db
            .prepare(
                `INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status_code, attempt_count, success, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                id,
                webhook.id,
                event,
                JSON.stringify(payload),
                response.status,
                attemptCount,
                success ? 1 : 0,
                errorMessage,
                timestamp,
            )
            .run();

        // Update webhook's last triggered time
        await db
            .prepare("UPDATE webhooks SET last_triggered_at = ? WHERE id = ?")
            .bind(timestamp, webhook.id)
            .run();

        // Retry logic for failed deliveries
        if (!success && attemptCount < 3) {
            // Exponential backoff: 5s, 25s, 125s
            const backoffMs = 5 ** attemptCount * 1000;
            setTimeout(() => {
                deliverWebhook(webhook, event, payload, attemptCount + 1);
            }, backoffMs);
        }

        return {
            id,
            webhookId: webhook.id,
            event,
            payload,
            statusCode: response.status,
            attemptCount,
            success,
            errorMessage: errorMessage || undefined,
            createdAt: timestamp,
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

        // Log failed delivery
        await db
            .prepare(
                `INSERT INTO webhook_deliveries (id, webhook_id, event, payload, attempt_count, success, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                id,
                webhook.id,
                event,
                JSON.stringify(payload),
                attemptCount,
                0,
                errorMessage,
                timestamp,
            )
            .run();

        // Retry if we haven't exceeded attempts
        if (attemptCount < 3) {
            const backoffMs = 5 ** attemptCount * 1000;
            setTimeout(() => {
                deliverWebhook(webhook, event, payload, attemptCount + 1);
            }, backoffMs);
        }

        return {
            id,
            webhookId: webhook.id,
            event,
            payload,
            attemptCount,
            success: false,
            errorMessage,
            createdAt: timestamp,
        };
    }
}

/**
 * Create HMAC signature for webhook verification
 */
export function createWebhookSignature(
    payload: string,
    secret: string,
): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
): boolean {
    const expectedSignature = createWebhookSignature(payload, secret);
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
    );
}

/**
 * Get webhook delivery history
 */
export async function getWebhookDeliveries(
    webhookId: string,
    limit: number = 50,
    offset: number = 0,
): Promise<WebhookDelivery[]> {
    const db = await getDatabase();

    try {
        const response = await db
            .prepare(
                `SELECT * FROM webhook_deliveries 
        WHERE webhook_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?`,
            )
            .bind(webhookId, limit, offset)
            .all();

        const results = (response as any).results || response;

        return results.map((row: any) => ({
            id: row.id,
            webhookId: row.webhook_id,
            event: row.event,
            payload: JSON.parse(row.payload),
            statusCode: row.status_code,
            attemptCount: row.attempt_count,
            success: Boolean(row.success),
            errorMessage: row.error_message,
            createdAt: row.created_at,
        }));
    } catch (error) {
        console.error("Error fetching webhook deliveries:", error);
        return [];
    }
}

/**
 * Get webhook delivery stats
 */
export async function getWebhookStats(
    webhookId: string,
    hoursBack: number = 24,
) {
    const db = await getDatabase();
    const since = new Date(
        Date.now() - hoursBack * 60 * 60 * 1000,
    ).toISOString();

    try {
        const totalResult = (await db
            .prepare(
                "SELECT COUNT(*) as count FROM webhook_deliveries WHERE webhook_id = ? AND created_at > ?",
            )
            .bind(webhookId, since)
            .first()) as any;

        const successResult = (await db
            .prepare(
                "SELECT COUNT(*) as count FROM webhook_deliveries WHERE webhook_id = ? AND created_at > ? AND success = 1",
            )
            .bind(webhookId, since)
            .first()) as any;

        const eventStats = (await db
            .prepare(
                `SELECT event, COUNT(*) as count, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
        FROM webhook_deliveries
        WHERE webhook_id = ? AND created_at > ?
        GROUP BY event`,
            )
            .bind(webhookId, since)
            .all()) as any;

        const eventResults = ((eventStats as any).results || eventStats).map(
            (row: any) => ({
                event: row.event,
                total: row.count,
                successful: row.successful,
                failed: row.count - row.successful,
                successRate: (row.successful / row.count) * 100,
            }),
        );

        return {
            totalDeliveries: totalResult?.count || 0,
            successfulDeliveries: successResult?.count || 0,
            failedDeliveries:
                (totalResult?.count || 0) - (successResult?.count || 0),
            successRate: totalResult?.count
                ? ((successResult?.count || 0) / totalResult.count) * 100
                : 0,
            eventStats: eventResults,
        };
    } catch (error) {
        console.error("Error getting webhook stats:", error);
        return {
            totalDeliveries: 0,
            successfulDeliveries: 0,
            failedDeliveries: 0,
            successRate: 0,
            eventStats: [],
        };
    }
}

/**
 * Retry failed webhook delivery
 */
export async function retryWebhookDelivery(
    deliveryId: string,
    webhookId: string,
): Promise<boolean> {
    const db = await getDatabase();

    try {
        const delivery = (await db
            .prepare("SELECT * FROM webhook_deliveries WHERE id = ?")
            .bind(deliveryId)
            .first()) as any;

        if (!delivery) return false;

        const webhook = await getWebhook(webhookId);
        if (!webhook) return false;

        // Re-deliver
        const payload = JSON.parse(delivery.payload);
        await deliverWebhook(webhook, delivery.event, payload, 1);

        return true;
    } catch (error) {
        console.error("Error retrying webhook delivery:", error);
        return false;
    }
}

/**
 * Test webhook by sending a test event
 */
export async function testWebhook(
    webhookId: string,
    userId: string,
): Promise<WebhookDelivery | null> {
    const webhook = await getWebhook(webhookId, userId);
    if (!webhook) return null;

    const testPayload = {
        test: true,
        timestamp: new Date().toISOString(),
        message: "This is a test webhook delivery",
    };

    return deliverWebhook(webhook, "user.created", testPayload);
}
