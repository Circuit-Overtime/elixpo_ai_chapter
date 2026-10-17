export const runtime = "edge";
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import {
    getAccountSessions,
    setAccountSessionsCookie,
} from "@/lib/account-sessions";
import { getDatabase } from "@/lib/d1-client";
import { getRefreshTokenByHash, getUserById } from "@/lib/db";
import { createAccessToken, verifyJWT } from "@/lib/jwt";
import { createAccountSwitchRateLimiter } from "@/lib/rate-limit";
import { hashString } from "@/lib/webcrypto";

type AccountSummary = {
    id: string;
    email: string;
    displayName: string | null;
    username: string | null;
    avatar: string | null;
    provider: string;
};

async function validAccounts(request: NextRequest) {
    const db = await getDatabase();
    const sessions = await getAccountSessions(request);
    const accounts: Array<{
        summary: AccountSummary;
        refreshToken: string;
        provider:
            | "google"
            | "github"
            | "discord"
            | "microsoft"
            | "email"
            | undefined;
        expiresAt: number;
    }> = [];

    for (const session of sessions) {
        const payload = await verifyJWT(session.refreshToken);
        if (payload?.type !== "refresh") continue;

        const stored = await getRefreshTokenByHash(
            db,
            await hashString(session.refreshToken),
        );
        if (!stored) continue;

        const user = (await getUserById(db, session.userId)) as any;
        if (!user) continue;
        const identity = (await db
            .prepare(
                "SELECT provider, provider_profile_url FROM identities WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
            )
            .bind(session.userId)
            .first()) as {
            provider: string;
            provider_profile_url: string | null;
        } | null;

        accounts.push({
            summary: {
                id: user.id,
                email: user.email,
                displayName: user.display_name || null,
                username: user.username || null,
                avatar: identity?.provider_profile_url || null,
                provider: payload.provider || identity?.provider || "email",
            },
            refreshToken: session.refreshToken,
            provider: payload.provider,
            expiresAt: payload.exp,
        });
    }

    return accounts;
}

export async function GET(request: NextRequest) {
    const accounts = await validAccounts(request);
    const activeToken = request.cookies.get("access_token")?.value;
    const activePayload = activeToken ? await verifyJWT(activeToken) : null;
    const activeUserId =
        activePayload?.type === "access"
            ? activePayload.sub
            : request.cookies.get("user_id")?.value || null;

    return NextResponse.json(
        {
            activeUserId,
            accounts: accounts.map((account) => account.summary),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(request: NextRequest) {
    const ipAddress =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        request.headers.get("cf-connecting-ip") ||
        "unknown";
    const rateLimit = await createAccountSwitchRateLimiter().check(
        await getDatabase(),
        ipAddress,
        "account_switch",
    );
    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many account switches. Please try again shortly." },
            {
                status: 429,
                headers: {
                    "Retry-After": String(rateLimit.retryAfter || 60),
                },
            },
        );
    }

    const body = (await request.json().catch(() => null)) as {
        userId?: string;
    } | null;
    if (!body?.userId) {
        return NextResponse.json(
            { error: "userId is required" },
            { status: 400 },
        );
    }

    const account = (await validAccounts(request)).find(
        (candidate) => candidate.summary.id === body.userId,
    );
    if (!account) {
        return NextResponse.json(
            { error: "Account session is unavailable or expired" },
            { status: 404 },
        );
    }

    const accessMaxAge =
        parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10) * 60;
    const refreshMaxAge = Math.max(
        account.expiresAt - Math.floor(Date.now() / 1000),
        1,
    );
    const accessToken = await createAccessToken(
        account.summary.id,
        account.summary.email,
        account.provider,
    );
    const response = NextResponse.json({
        activeUserId: account.summary.id,
        account: account.summary,
    });
    const cookieOptions = {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
    };

    response.cookies.set("access_token", accessToken, {
        ...cookieOptions,
        httpOnly: true,
        maxAge: accessMaxAge,
    });
    response.cookies.set("refresh_token", account.refreshToken, {
        ...cookieOptions,
        httpOnly: true,
        maxAge: refreshMaxAge,
    });
    response.cookies.set("user_id", account.summary.id, {
        ...cookieOptions,
        httpOnly: false,
        maxAge: refreshMaxAge,
    });
    await setAccountSessionsCookie(
        request,
        response,
        account.refreshToken,
        refreshMaxAge,
    );

    return response;
}
