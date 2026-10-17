export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import {
    authenticateOAuthClient,
    getRefreshTokenByHashIncludingRevoked,
    logAuditEvent,
    revokeRefreshToken,
    revokeRefreshTokenFamily,
} from "@/lib/db";
import { generateUUID, hashString } from "@/lib/webcrypto";

export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get("content-type") || "";
        let body: any;
        if (contentType.includes("application/x-www-form-urlencoded")) {
            const formData = await request.formData();
            body = Object.fromEntries(formData.entries());
        } else {
            body = await request.json().catch(() => ({}));
        }

        const { token, client_id, client_secret } = body;

        if (!token || !client_id) {
            return NextResponse.json(
                { error: "invalid_request" },
                { status: 400 },
            );
        }

        const db = await getDatabase();
        const client = await authenticateOAuthClient(
            db,
            client_id,
            client_secret ? await hashString(client_secret) : null,
        );

        if (!client) {
            return NextResponse.json(
                { error: "invalid_client" },
                { status: 401 },
            );
        }

        const tokenHash = await hashString(token);
        const record = (await getRefreshTokenByHashIncludingRevoked(
            db,
            tokenHash,
        )) as {
            client_id: string | null;
            family_id: string | null;
            user_id: string;
        } | null;

        // RFC 7009 requires an HTTP 200 response for unknown tokens. Only
        // revoke a token that belongs to the authenticated client.
        if (record && record.client_id === client_id) {
            if (record.family_id) {
                await revokeRefreshTokenFamily(db, record.family_id, "logout");
            } else {
                await revokeRefreshToken(db, tokenHash, "logout");
            }
            await logAuditEvent(db, {
                id: generateUUID(),
                userId: record.user_id,
                eventType: "session_revoked",
                provider: client_id,
                status: "success",
            }).catch(() => {});
        }

        return NextResponse.json({}, { status: 200 });
    } catch (error) {
        console.error("[Revoke Endpoint] Error:", error);
        return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
}
