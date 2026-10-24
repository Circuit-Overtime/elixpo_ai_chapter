import type { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "./jwt";

export const ACCOUNT_SESSIONS_COOKIE = "account_sessions";
export const MAX_ACCOUNT_SESSIONS = 5;

type AccountSession = {
    userId: string;
    refreshToken: string;
    expiresAt: number;
};

function readStoredTokens(request: NextRequest): string[] {
    const raw = request.cookies.get(ACCOUNT_SESSIONS_COOKIE)?.value;
    if (!raw) return [];

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (token): token is string =>
                typeof token === "string" &&
                token.length > 0 &&
                token.length < 2048,
        );
    } catch {
        return [];
    }
}

export async function getAccountSessions(
    request: NextRequest,
): Promise<AccountSession[]> {
    const candidates = [
        request.cookies.get("refresh_token")?.value,
        ...readStoredTokens(request),
    ].filter((token): token is string => !!token);
    const sessions = new Map<string, AccountSession>();

    for (const refreshToken of candidates) {
        const payload = await verifyJWT(refreshToken);
        if (payload?.type === "refresh" && !sessions.has(payload.sub)) {
            sessions.set(payload.sub, {
                userId: payload.sub,
                refreshToken,
                expiresAt: payload.exp,
            });
        }
    }

    return [...sessions.values()].slice(0, MAX_ACCOUNT_SESSIONS);
}

export async function setAccountSessionsCookie(
    request: NextRequest,
    response: NextResponse,
    refreshToken: string,
    maxAge: number,
): Promise<void> {
    const nextPayload = await verifyJWT(refreshToken);
    if (nextPayload?.type !== "refresh") return;

    const existing = await getAccountSessions(request);
    const tokens = [
        refreshToken,
        ...existing
            .filter((session) => session.userId !== nextPayload.sub)
            .map((session) => session.refreshToken),
    ].slice(0, MAX_ACCOUNT_SESSIONS);
    const now = Math.floor(Date.now() / 1000);
    const cookieMaxAge = Math.max(
        maxAge,
        ...existing.map((session) => Math.max(session.expiresAt - now, 1)),
    );

    response.cookies.set(ACCOUNT_SESSIONS_COOKIE, JSON.stringify(tokens), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: cookieMaxAge,
        path: "/",
    });
}

export function clearAccountSessionsCookie(response: NextResponse): void {
    response.cookies.set(ACCOUNT_SESSIONS_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
    });
}
