/**
 * API Key Rate Limiter
 * Tracks and enforces rate limits for API keys
 */

import crypto from "crypto";
import { getDatabase } from "./d1-client";

export interface RateLimitStatus {
    allowed: boolean;
    requestsUsed: number;
    requestsLimit: number;
    remainingRequests: number;
    resetAt: Date;
    retryAfter?: number;
}

/**
 * Get rate limit status for an API key
 * Uses a sliding window approach with minute-based tracking
 */
export async function checkApiKeyRateLimit(
    apiKeyId: string,
    rateLimitRequests: number,
    rateLimitWindow: number, // in seconds
): Promise<RateLimitStatus> {
    const db = await getDatabase();
    const now = new Date();
    const windowStartTime = new Date(now.getTime() - rateLimitWindow * 1000);

    try {
        // Count requests in the current window
        const result = (await db
            .prepare(
                `SELECT COUNT(*) as count FROM api_key_usage 
        WHERE api_key_id = ? AND created_at > ?`,
            )
            .bind(apiKeyId, windowStartTime.toISOString())
            .first()) as any;

        const requestsUsed = result?.count || 0;
        const remainingRequests = Math.max(0, rateLimitRequests - requestsUsed);
        const resetAt = new Date(
            windowStartTime.getTime() + rateLimitWindow * 1000,
        );

        return {
            allowed: requestsUsed < rateLimitRequests,
            requestsUsed,
            requestsLimit: rateLimitRequests,
            remainingRequests,
            resetAt,
            retryAfter:
                requestsUsed >= rateLimitRequests
                    ? Math.ceil((resetAt.getTime() - now.getTime()) / 1000)
                    : undefined,
        };
    } catch (error) {
        console.error("Error checking rate limit:", error);
        // Default to allowing on error (graceful degradation)
        return {
            allowed: true,
            requestsUsed: 0,
            requestsLimit: rateLimitRequests,
            remainingRequests: rateLimitRequests,
            resetAt: new Date(now.getTime() + rateLimitWindow * 1000),
        };
    }
}

/**
 * Increment API key usage counter
 * Should be called after a successful API request
 */
export async function logApiKeyUsage(
    apiKeyId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime: number,
    ipAddress: string,
    userAgent?: string,
): Promise<boolean> {
    const db = await getDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
        // Log the usage
        await db
            .prepare(
                `INSERT INTO api_key_usage (id, api_key_id, endpoint, method, status_code, response_time, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
                id,
                apiKeyId,
                endpoint,
                method,
                statusCode,
                responseTime,
                ipAddress,
                userAgent || null,
                now,
            )
            .run();

        // Update last_used_at for the API key
        await db
            .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
            .bind(now, apiKeyId)
            .run();

        return true;
    } catch (error) {
        console.error("Error logging API key usage:", error);
        return false;
    }
}

/**
 * Get API key usage statistics for a time period
 */
export async function getApiKeyStats(
    apiKeyId: string,
    hoursBack: number = 24,
): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    topEndpoints: Array<{ endpoint: string; count: number }>;
    topMethods: Array<{ method: string; count: number }>;
}> {
    const db = await getDatabase();
    const since = new Date(
        Date.now() - hoursBack * 60 * 60 * 1000,
    ).toISOString();

    try {
        // Total requests
        const totalResult = (await db
            .prepare(
                "SELECT COUNT(*) as count FROM api_key_usage WHERE api_key_id = ? AND created_at > ?",
            )
            .bind(apiKeyId, since)
            .first()) as any;

        // Successful vs failed
        const successResult = (await db
            .prepare(
                "SELECT COUNT(*) as count FROM api_key_usage WHERE api_key_id = ? AND created_at > ? AND status_code < 400",
            )
            .bind(apiKeyId, since)
            .first()) as any;

        // Average response time
        const timeResult = (await db
            .prepare(
                "SELECT AVG(response_time) as avg_time FROM api_key_usage WHERE api_key_id = ? AND created_at > ?",
            )
            .bind(apiKeyId, since)
            .first()) as any;

        // Top endpoints
        const endpointsResponse = await db
            .prepare(
                `SELECT endpoint, COUNT(*) as count 
         FROM api_key_usage 
         WHERE api_key_id = ? AND created_at > ? 
         GROUP BY endpoint 
         ORDER BY count DESC 
         LIMIT 5`,
            )
            .bind(apiKeyId, since)
            .all();

        const topEndpoints = (
            (endpointsResponse as any).results || endpointsResponse
        ).map((row: any) => ({
            endpoint: row.endpoint,
            count: row.count,
        }));

        // Top methods
        const methodsResponse = await db
            .prepare(
                `SELECT method, COUNT(*) as count 
         FROM api_key_usage 
         WHERE api_key_id = ? AND created_at > ? 
         GROUP BY method 
         ORDER BY count DESC`,
            )
            .bind(apiKeyId, since)
            .all();

        const topMethods = (
            (methodsResponse as any).results || methodsResponse
        ).map((row: any) => ({
            method: row.method,
            count: row.count,
        }));

        return {
            totalRequests: totalResult?.count || 0,
            successfulRequests: successResult?.count || 0,
            failedRequests:
                (totalResult?.count || 0) - (successResult?.count || 0),
            averageResponseTime: Math.round(timeResult?.avg_time || 0),
            topEndpoints,
            topMethods,
        };
    } catch (error) {
        console.error("Error getting API key stats:", error);
        return {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            topEndpoints: [],
            topMethods: [],
        };
    }
}

/**
 * Get recent API key requests
 */
export async function getApiKeyRequests(
    apiKeyId: string,
    limit: number = 50,
): Promise<
    Array<{
        id: string;
        endpoint: string;
        method: string;
        statusCode: number;
        responseTime: number;
        ipAddress: string;
        userAgent?: string;
        createdAt: string;
    }>
> {
    const db = await getDatabase();

    try {
        const response = await db
            .prepare(
                `SELECT id, endpoint, method, status_code, response_time, ip_address, user_agent, created_at 
         FROM api_key_usage 
         WHERE api_key_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
            )
            .bind(apiKeyId, limit)
            .all();

        const results = (response as any).results || response;

        return results.map((row: any) => ({
            id: row.id,
            endpoint: row.endpoint,
            method: row.method,
            statusCode: row.status_code,
            responseTime: row.response_time,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            createdAt: row.created_at,
        }));
    } catch (error) {
        console.error("Error getting API key requests:", error);
        return [];
    }
}

/**
 * Clean up old usage records (retention policy)
 * Keeps records for 90 days by default
 */
export async function cleanupOldApiKeyUsage(
    retentionDays: number = 90,
): Promise<boolean> {
    const db = await getDatabase();
    const cutoffDate = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
        await db
            .prepare("DELETE FROM api_key_usage WHERE created_at < ?")
            .bind(cutoffDate)
            .run();

        return true;
    } catch (error) {
        console.error("Error cleaning up API key usage:", error);
        return false;
    }
}
