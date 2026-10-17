export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { isUsernameTaken } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/kv-cache";
import { validateUsername } from "@/lib/username";

/**
 * GET /api/auth/username/check?u=<handle>
 * Availability check for a username. Format is validated first; the D1 UNIQUE
 * index is the source of truth, with a short-lived KV cache as a fast path.
 */
export async function GET(request: NextRequest) {
    const raw = request.nextUrl.searchParams.get("u") || "";
    const result = validateUsername(raw);
    if (!result.ok) {
        return NextResponse.json({ available: false, reason: result.reason });
    }
    const username = result.value;

    try {
        // KV fast path. We only trust a cached `taken: true` (a handle never
        // becomes free again in practice); `available` is re-confirmed against D1.
        const cached = await cacheGet<{ taken: boolean }>(
            `username:taken:${username}`,
        );
        if (cached?.taken) {
            return NextResponse.json({
                available: false,
                reason: "That username is taken.",
            });
        }

        const db = await getDatabase();
        const taken = await isUsernameTaken(db, username);
        await cacheSet(
            `username:taken:${username}`,
            { taken },
            taken ? 86400 : 30,
        );

        return NextResponse.json(
            taken
                ? { available: false, reason: "That username is taken." }
                : { available: true },
        );
    } catch {
        // On infra failure, don't claim availability — let the authoritative
        // UNIQUE constraint reject at write time.
        return NextResponse.json({
            available: false,
            reason: "Could not check right now.",
        });
    }
}
