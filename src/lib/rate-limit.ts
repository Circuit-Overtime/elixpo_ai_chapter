import type { D1Database } from "@cloudflare/workers-types";
import { generateUUID } from "./webcrypto";

export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    blockDurationMs?: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    retryAfter?: number;
}

class DatabaseRateLimiter {
    private windowMs: number;
    private maxRequests: number;
    private blockDurationMs: number;

    constructor(config: RateLimitConfig) {
        this.windowMs = config.windowMs;
        this.maxRequests = config.maxRequests;
        this.blockDurationMs = config.blockDurationMs || 0;
    }

    async check(
        db: D1Database,
        ipAddress: string,
        endpoint: string,
    ): Promise<RateLimitResult> {
        const now = new Date();
        const windowResetAt = new Date(Date.now() + this.windowMs);

        try {
            // Check if IP is currently blocked
            const blockedEntry = await db
                .prepare(
                    `SELECT * FROM rate_limits 
           WHERE ip_address = ? AND endpoint = ? AND is_blocked = 1 AND blocked_until > ?`,
                )
                .bind(ipAddress, endpoint, now.toISOString())
                .first();

            if (blockedEntry) {
                const resetTime = new Date(
                    String(blockedEntry.blocked_until),
                ).getTime();
                return {
                    allowed: false,
                    remaining: 0,
                    resetAt: resetTime,
                    retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
                };
            }

            // Get or create rate limit entry
            const entry = await db
                .prepare(
                    `SELECT * FROM rate_limits 
           WHERE ip_address = ? AND endpoint = ?`,
                )
                .bind(ipAddress, endpoint)
                .first();

            if (
                !entry ||
                new Date(String(entry.window_reset_at)).getTime() < Date.now()
            ) {
                // Window expired or new entry - reset
                const entryId = generateUUID();
                await db
                    .prepare(
                        `INSERT INTO rate_limits (id, ip_address, endpoint, attempt_count, window_reset_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(ip_address, endpoint) DO UPDATE SET 
               attempt_count = 1,
               window_reset_at = ?,
               is_blocked = 0,
               blocked_until = NULL,
               first_attempt_at = CURRENT_TIMESTAMP,
               last_attempt_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP`,
                    )
                    .bind(
                        entryId,
                        ipAddress,
                        endpoint,
                        1,
                        windowResetAt.toISOString(),
                        windowResetAt.toISOString(),
                    )
                    .run();

                return {
                    allowed: true,
                    remaining: this.maxRequests - 1,
                    resetAt: windowResetAt.getTime(),
                };
            }

            const currentCount = (entry.attempt_count as number) || 0;

            if (currentCount >= this.maxRequests) {
                // Exceeded limit - block the IP
                const blockedUntil = new Date(
                    Date.now() + (this.blockDurationMs || this.windowMs),
                );
                await db
                    .prepare(
                        `UPDATE rate_limits 
             SET attempt_count = attempt_count + 1,
                 is_blocked = 1,
                 blocked_until = ?,
                 last_attempt_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE ip_address = ? AND endpoint = ?`,
                    )
                    .bind(blockedUntil.toISOString(), ipAddress, endpoint)
                    .run();

                return {
                    allowed: false,
                    remaining: 0,
                    resetAt: blockedUntil.getTime(),
                    retryAfter: Math.ceil(
                        (blockedUntil.getTime() - Date.now()) / 1000,
                    ),
                };
            }

            await db
                .prepare(
                    `UPDATE rate_limits 
           SET attempt_count = attempt_count + 1,
               last_attempt_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE ip_address = ? AND endpoint = ?`,
                )
                .bind(ipAddress, endpoint)
                .run();

            const resetTime = new Date(String(entry.window_reset_at)).getTime();
            return {
                allowed: true,
                remaining: Math.max(0, this.maxRequests - currentCount - 1),
                resetAt: resetTime,
            };
        } catch (error) {
            console.error("Rate limit check error:", error);
            return {
                allowed: true,
                remaining: this.maxRequests,
                resetAt: windowResetAt.getTime(),
            };
        }
    }

    async cleanup(db: D1Database): Promise<void> {
        try {
            const now = new Date();
            await db
                .prepare(
                    `DELETE FROM rate_limits 
           WHERE window_reset_at < ? AND blocked_until < ?`,
                )
                .bind(now.toISOString(), now.toISOString())
                .run();
        } catch (error) {
            console.error("Rate limit cleanup error:", error);
        }
    }
}

// Export factory functions for different endpoints
export function createLoginRateLimiter(): DatabaseRateLimiter {
    return new DatabaseRateLimiter({
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10, // 10 attempts per minute
        blockDurationMs: 15 * 60 * 1000, // 15 minute block
    });
}

export function createRegisterRateLimiter(): DatabaseRateLimiter {
    return new DatabaseRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 5,
        blockDurationMs: 30 * 60 * 1000,
    });
}

export function createPasswordResetRateLimiter(): DatabaseRateLimiter {
    return new DatabaseRateLimiter({
        windowMs: 60 * 60 * 1000,
        maxRequests: 3,
        blockDurationMs: 60 * 60 * 1000,
    });
}

export function createAccountSwitchRateLimiter(): DatabaseRateLimiter {
    return new DatabaseRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 30,
        blockDurationMs: 5 * 60 * 1000,
    });
}

// Device authorization grant (RFC 8628, accounts.elixpo#79). Issuance is
// keyed by IP; a legitimate CLI issues one code per login attempt, so 10/min
// comfortably covers retries while capping enumeration/DoS attempts against
// the hashing + insert path.
export function createDeviceIssuanceRateLimiter(): DatabaseRateLimiter {
    return new DatabaseRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 10,
        blockDurationMs: 10 * 60 * 1000,
    });
}

// User-code lookup (verification page resolving a typed code). Tighter than
// issuance — this is the endpoint code-guessing attacks would hammer, since
// user codes are short and human-typeable by design.
export function createDeviceLookupRateLimiter(): DatabaseRateLimiter {
    return new DatabaseRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 20,
        blockDurationMs: 15 * 60 * 1000,
    });
}

export function createBrandingVerificationRateLimiter(): DatabaseRateLimiter {
    return new DatabaseRateLimiter({
        windowMs: 60 * 1000,
        maxRequests: 5,
        blockDurationMs: 10 * 60 * 1000,
    });
}

export { DatabaseRateLimiter };
