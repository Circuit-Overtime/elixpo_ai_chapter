export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { clearAccountSessionsCookie } from "@/lib/account-sessions";
import { getDatabase } from "@/lib/d1-client";
import { verifyJWT } from "@/lib/jwt";

/**
 * POST /api/auth/delete-account
 * Permanently delete the authenticated user's account and all associated data
 */
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get("access_token")?.value;
        if (!token)
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );

        const payload = await verifyJWT(token);
        if (!payload)
            return NextResponse.json(
                { error: "Invalid token" },
                { status: 401 },
            );

        const userId = payload.sub;
        const db = await getDatabase();

        // Capture which apps the user authorized BEFORE deleting tokens, so we
        // can notify each to purge the user's data (first-party apps only).
        let connectedClientIds: string[] = [];
        try {
            const conn = await db
                .prepare(
                    "SELECT DISTINCT client_id FROM refresh_tokens WHERE user_id = ? AND client_id IS NOT NULL",
                )
                .bind(userId)
                .all();
            connectedClientIds = (conn.results || []).map(
                (r: any) => r.client_id,
            );
        } catch {}

        // Delete in order: dependent tables first, then user
        await db
            .prepare("DELETE FROM refresh_tokens WHERE user_id = ?")
            .bind(userId)
            .run();
        await db
            .prepare("DELETE FROM email_verification_tokens WHERE user_id = ?")
            .bind(userId)
            .run();
        await db
            .prepare("DELETE FROM identities WHERE user_id = ?")
            .bind(userId)
            .run();
        await db
            .prepare("DELETE FROM audit_logs WHERE user_id = ?")
            .bind(userId)
            .run();
        // Deactivate OAuth apps owned by this user
        await db
            .prepare(
                "UPDATE oauth_clients SET is_active = 0 WHERE owner_id = ?",
            )
            .bind(userId)
            .run();
        // Delete the user
        await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

        console.log("[Account] Deleted user: %s", userId);

        // Notify connected first-party apps to hard-purge the user's data.
        // App-scoped webhook dispatch — the new model. Targets any OAuth
        // app that registered a webhook_url + subscribed to "user.deleted"
        // at registration time. Works for both first-party and third-party
        // integrators (e.g. ElixpoURL).
        try {
            const { dispatchAppEvent, defaultSecretResolver } = await import(
                "@/lib/app-webhooks"
            );
            const { getRequestContext } = await import(
                "@cloudflare/next-on-pages"
            );
            const kv = (getRequestContext().env as any).KV as KVNamespace;
            await dispatchAppEvent(
                "user.deleted",
                { elixpo_id: userId, deleted_at: new Date().toISOString() },
                connectedClientIds,
                defaultSecretResolver(kv),
            );
        } catch (err) {
            console.error("[delete-account] app webhook dispatch failed:", err);
        }

        // Legacy env-var-configured first-party receivers. Keep until every
        // first-party app has been re-registered with a webhook_url so no
        // deletion notifications are dropped during the migration window.
        try {
            const { fireRevocationToAll } = await import(
                "@/lib/revocation-webhook"
            );
            await fireRevocationToAll(
                connectedClientIds,
                userId,
                "user.deleted",
            );
        } catch {}

        // Clear auth cookies
        const response = NextResponse.json({
            message: "Account deleted successfully",
        });
        response.cookies.set("access_token", "", { maxAge: 0, path: "/" });
        response.cookies.set("refresh_token", "", { maxAge: 0, path: "/" });
        clearAccountSessionsCookie(response);
        return response;
    } catch (error) {
        console.error("[Account] Delete error:", error);
        return NextResponse.json(
            { error: "Failed to delete account" },
            { status: 500 },
        );
    }
}
