import type { NextRequest, NextResponse } from "next/server";
import { setAccountSessionsCookie } from "./account-sessions";
import { getDatabase } from "./d1-client";
import { getUserById } from "./db";
import { verifyJWT } from "./jwt";
import { rotateRefreshToken } from "./refresh-rotation";

export type RefreshSuccess = {
    ok: true;
    userId: string;
    email: string;
    displayName: string | null;
    provider:
        | "google"
        | "github"
        | "discord"
        | "microsoft"
        | "email"
        | undefined;
    emailVerified: boolean;
    newAccessToken: string;
    newRefreshToken: string;
    accessMaxAge: number;
    refreshMaxAge: number;
};

export type RefreshFailure = {
    ok: false;
    reason:
        | "invalid_token"
        | "token_revoked"
        | "user_not_found"
        | "internal_error";
};

export async function tryRefreshSession(
    request: NextRequest,
    refreshToken: string,
): Promise<RefreshSuccess | RefreshFailure> {
    try {
        const payload = await verifyJWT(refreshToken);
        if (payload?.type !== "refresh") {
            return { ok: false, reason: "invalid_token" };
        }

        const db = await getDatabase();
        const ipAddress =
            request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
            request.headers.get("cf-connecting-ip") ||
            "unknown";
        const userAgent = request.headers.get("user-agent") || "unknown";
        const refreshRemainingSeconds = Math.max(
            payload.exp - Math.floor(Date.now() / 1000),
            0,
        );
        const refreshDays = Math.max(
            Math.ceil(refreshRemainingSeconds / 86_400),
            1,
        );

        const result = await rotateRefreshToken(db, {
            refreshTokenJWT: refreshToken,
            clientId: "elixpo-web-ui",
            ipAddress,
            userAgent,
            refreshExpiresInDays: refreshDays,
        });

        if ("error" in result) {
            if (result.error === "invalid_grant")
                return { ok: false, reason: "token_revoked" };
            return { ok: false, reason: "invalid_token" };
        }

        const user = (await getUserById(db, payload.sub)) as {
            id: string;
            email: string;
            display_name: string | null;
            email_verified: number;
        } | null;
        if (!user) {
            return { ok: false, reason: "user_not_found" };
        }

        const accessMaxAge =
            parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10) * 60;
        const refreshMaxAge = refreshDays * 86_400;

        return {
            ok: true,
            userId: payload.sub,
            email: user.email,
            displayName: user.display_name ?? null,
            provider: payload.provider,
            emailVerified: !!user.email_verified,
            newAccessToken: result.access_token,
            newRefreshToken: result.refresh_token,
            accessMaxAge,
            refreshMaxAge,
        };
    } catch (err) {
        console.error("[auth-refresh] tryRefreshSession failed:", err);
        return { ok: false, reason: "internal_error" };
    }
}

export async function applyRefreshedCookies(
    response: NextResponse,
    refresh: RefreshSuccess,
    request?: NextRequest,
): Promise<NextResponse> {
    const isProd = process.env.NODE_ENV === "production";
    response.cookies.set("access_token", refresh.newAccessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: refresh.accessMaxAge,
        path: "/",
    });
    response.cookies.set("refresh_token", refresh.newRefreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: refresh.refreshMaxAge,
        path: "/",
    });
    response.cookies.set("user_id", refresh.userId, {
        httpOnly: false,
        secure: isProd,
        sameSite: "lax",
        maxAge: refresh.refreshMaxAge,
        path: "/",
    });
    if (request) {
        await setAccountSessionsCookie(
            request,
            response,
            refresh.newRefreshToken,
            refresh.refreshMaxAge,
        );
    }
    return response;
}
