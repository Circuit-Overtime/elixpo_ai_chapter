/**
 * API Key Service
 * Handles generation, validation, and management of API keys
 */

import { getDatabase } from "./d1-client";

export interface ApiKeyScopes {
    "auth:read"?: boolean;
    "auth:write"?: boolean;
    "users:read"?: boolean;
    "users:write"?: boolean;
    "apps:read"?: boolean;
    "apps:write"?: boolean;
    "analytics:read"?: boolean;
    "webhooks:read"?: boolean;
    "webhooks:write"?: boolean;
    "admin:read"?: boolean;
    "admin:write"?: boolean;
}

export interface ApiKey {
    id: string;
    userId: string;
    name: string;
    description?: string;
    prefix: string;
    scopes: ApiKeyScopes;
    rateLimitRequests: number;
    rateLimitWindow: number;
    lastUsedAt?: string;
    createdAt: string;
    expiresAt?: string;
    revoked: boolean;
    revokedAt?: string;
}

/**
 * Generate a new API key
 * Returns the full key (only shown once to user)
 */
export async function generateApiKey(
    userId: string,
    name: string,
    scopes: ApiKeyScopes,
    expiresAt?: Date,
    description?: string,
): Promise<{ key: string; apiKey: ApiKey }> {
    const db = await getDatabase();
    const id = crypto.randomUUID();

    // Generate 32-byte random key
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(keyBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    // Create hash for storage
    const keyHash = await hashApiKey(key);

    // Create prefix (first 8 chars of key)
    const prefix = key.substring(0, 8);

    const createdAt = new Date().toISOString();
    const scopesJson = JSON.stringify(scopes);

    try {
        await db
            .prepare(
                `INSERT INTO api_keys (
          id, user_id, key_hash, name, description, prefix, scopes, 
          created_at, expires_at, created_by_ip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                id,
                userId,
                keyHash,
                name,
                description || null,
                prefix,
                scopesJson,
                createdAt,
                expiresAt?.toISOString() || null,
                null, // IP should be added from middleware context
            )
            .run();

        return {
            key,
            apiKey: {
                id,
                userId,
                name,
                description,
                prefix,
                scopes,
                rateLimitRequests: 1000,
                rateLimitWindow: 60,
                createdAt,
                expiresAt: expiresAt?.toISOString(),
                revoked: false,
            },
        };
    } catch (error) {
        console.error("Error generating API key:", error);
        throw new Error("Failed to generate API key");
    }
}

/**
 * Validate and retrieve API key by full key
 */
export async function validateApiKey(
    key: string,
): Promise<(ApiKey & { userId: string }) | null> {
    const db = await getDatabase();
    const keyHash = await hashApiKey(key);

    try {
        const result = (await db
            .prepare(
                `SELECT
          id, user_id, name, description, prefix, scopes,
          rate_limit_requests, rate_limit_window,
          last_used_at, created_at, expires_at, revoked, revoked_at
        FROM api_keys
        WHERE key_hash = ? AND revoked = 0`,
            )
            .bind(keyHash)
            .first()) as any;

        if (!result) {
            return null;
        }

        // Check expiration
        if (result.expires_at && new Date(result.expires_at) < new Date()) {
            return null;
        }

        // Update last_used_at
        await db
            .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
            .bind(new Date().toISOString(), result.id)
            .run();

        return {
            id: result.id,
            userId: result.user_id,
            name: result.name,
            description: result.description,
            prefix: result.prefix,
            scopes: JSON.parse(result.scopes),
            rateLimitRequests: result.rate_limit_requests,
            rateLimitWindow: result.rate_limit_window,
            lastUsedAt: result.last_used_at,
            createdAt: result.created_at,
            expiresAt: result.expires_at,
            revoked: Boolean(result.revoked),
            revokedAt: result.revoked_at,
        };
    } catch (error) {
        console.error("Error validating API key:", error);
        return null;
    }
}

/**
 * Get all API keys for a user (without showing full key)
 */
export async function getUserApiKeys(userId: string): Promise<ApiKey[]> {
    const db = await getDatabase();

    try {
        const response = await db
            .prepare(
                `SELECT 
          id, user_id, name, description, prefix, scopes, 
          rate_limit_requests, rate_limit_window, 
          last_used_at, created_at, expires_at, revoked, revoked_at
        FROM api_keys 
        WHERE user_id = ?
        ORDER BY created_at DESC`,
            )
            .bind(userId)
            .all();

        const results = (response as any).results || response;

        return results.map((row: any) => ({
            id: row.id,
            userId: row.user_id,
            name: row.name,
            description: row.description,
            prefix: row.prefix,
            scopes: JSON.parse(row.scopes),
            rateLimitRequests: row.rate_limit_requests,
            rateLimitWindow: row.rate_limit_window,
            lastUsedAt: row.last_used_at,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            revoked: Boolean(row.revoked),
            revokedAt: row.revoked_at,
        }));
    } catch (error) {
        console.error("Error fetching user API keys:", error);
        return [];
    }
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
    keyId: string,
    userId: string,
): Promise<boolean> {
    const db = await getDatabase();

    try {
        const result = await db
            .prepare(
                "UPDATE api_keys SET revoked = 1, revoked_at = ? WHERE id = ? AND user_id = ?",
            )
            .bind(new Date().toISOString(), keyId, userId)
            .run();

        return result.meta?.changes > 0;
    } catch (error) {
        console.error("Error revoking API key:", error);
        return false;
    }
}

/**
 * Delete an API key
 */
export async function deleteApiKey(
    keyId: string,
    userId: string,
): Promise<boolean> {
    const db = await getDatabase();

    try {
        const result = await db
            .prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?")
            .bind(keyId, userId)
            .run();

        return result.meta?.changes > 0;
    } catch (error) {
        console.error("Error deleting API key:", error);
        return false;
    }
}

/**
 * Update API key (name, description, scopes, or rate limits)
 */
export async function updateApiKey(
    keyId: string,
    userId: string,
    updates: Partial<
        Pick<
            ApiKey,
            | "name"
            | "description"
            | "scopes"
            | "rateLimitRequests"
            | "rateLimitWindow"
        >
    >,
): Promise<ApiKey | null> {
    const db = await getDatabase();

    try {
        const current = (await db
            .prepare("SELECT * FROM api_keys WHERE id = ? AND user_id = ?")
            .bind(keyId, userId)
            .first()) as any;

        if (!current) {
            return null;
        }

        const updateData: Record<string, any> = {};
        const fields: string[] = [];
        const values: any[] = [];

        if (updates.name !== undefined) {
            updateData.name = updates.name;
            fields.push("name = ?");
            values.push(updates.name);
        }
        if (updates.description !== undefined) {
            fields.push("description = ?");
            values.push(updates.description || null);
        }
        if (updates.scopes !== undefined) {
            fields.push("scopes = ?");
            values.push(JSON.stringify(updates.scopes));
        }
        if (updates.rateLimitRequests !== undefined) {
            fields.push("rate_limit_requests = ?");
            values.push(updates.rateLimitRequests);
        }
        if (updates.rateLimitWindow !== undefined) {
            fields.push("rate_limit_window = ?");
            values.push(updates.rateLimitWindow);
        }

        if (fields.length === 0) {
            return null;
        }

        values.push(keyId, userId);

        await db
            .prepare(
                `UPDATE api_keys SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
            )
            .bind(...values)
            .run();

        // Fetch and return updated record
        const updated = (await db
            .prepare(
                `SELECT 
          id, user_id, name, description, prefix, scopes, 
          rate_limit_requests, rate_limit_window, 
          last_used_at, created_at, expires_at, revoked, revoked_at
        FROM api_keys 
        WHERE id = ?`,
            )
            .bind(keyId)
            .first()) as any;

        return {
            id: updated.id,
            userId: updated.user_id,
            name: updated.name,
            description: updated.description,
            prefix: updated.prefix,
            scopes: JSON.parse(updated.scopes),
            rateLimitRequests: updated.rate_limit_requests,
            rateLimitWindow: updated.rate_limit_window,
            lastUsedAt: updated.last_used_at,
            createdAt: updated.created_at,
            expiresAt: updated.expires_at,
            revoked: Boolean(updated.revoked),
            revokedAt: updated.revoked_at,
        };
    } catch (error) {
        console.error("Error updating API key:", error);
        return null;
    }
}

/**
 * Log API key usage
 */
export async function logApiKeyUsage(
    apiKeyId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime: number,
    ipAddress?: string,
    userAgent?: string,
): Promise<void> {
    const db = await getDatabase();
    const id = crypto.randomUUID();

    try {
        await db
            .prepare(
                `INSERT INTO api_key_usage (
          id, api_key_id, endpoint, method, status_code, response_time, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                id,
                apiKeyId,
                endpoint,
                method,
                statusCode,
                responseTime,
                ipAddress || null,
                userAgent || null,
                new Date().toISOString(),
            )
            .run();
    } catch (error) {
        console.error("Error logging API key usage:", error);
    }
}

/**
 * Get API key usage statistics
 */
export async function getApiKeyUsageStats(
    apiKeyId: string,
    days: number = 30,
): Promise<any> {
    const db = await getDatabase();
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
        const stats = (await db
            .prepare(
                `SELECT 
          COUNT(*) as total_requests,
          AVG(response_time) as avg_response_time,
          MIN(response_time) as min_response_time,
          MAX(response_time) as max_response_time,
          SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
          COUNT(DISTINCT endpoint) as unique_endpoints,
          MAX(created_at) as last_used
        FROM api_key_usage 
        WHERE api_key_id = ? AND created_at >= ?`,
            )
            .bind(apiKeyId, fromDate.toISOString())
            .first()) as any;

        return {
            totalRequests: stats.total_requests || 0,
            avgResponseTime: stats.avg_response_time || 0,
            minResponseTime: stats.min_response_time || 0,
            maxResponseTime: stats.max_response_time || 0,
            errorCount: stats.error_count || 0,
            uniqueEndpoints: stats.unique_endpoints || 0,
            lastUsed: stats.last_used,
        };
    } catch (error) {
        console.error("Error fetching API key usage stats:", error);
        return null;
    }
}

/**
 * Hash API key for storage
 */
async function hashApiKey(key: string): Promise<string> {
    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(key),
    );
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Check if API key has required scope
 */
export function hasScope(
    scopes: ApiKeyScopes,
    requiredScope: keyof ApiKeyScopes,
): boolean {
    return Boolean(scopes[requiredScope]);
}

/**
 * Verify multiple scopes
 */
export function hasScopesAll(
    scopes: ApiKeyScopes,
    requiredScopes: (keyof ApiKeyScopes)[],
): boolean {
    return requiredScopes.every((scope) => scopes[scope]);
}

/**
 * Verify at least one scope
 */
export function hasScopesAny(
    scopes: ApiKeyScopes,
    requiredScopes: (keyof ApiKeyScopes)[],
): boolean {
    return requiredScopes.some((scope) => scopes[scope]);
}
