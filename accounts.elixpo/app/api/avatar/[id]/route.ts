export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";

const SAFE_AVATAR_HOSTS = [
    "lh3.googleusercontent.com", // Google
    "avatars.githubusercontent.com", // GitHub
];

function isSafeAvatarUrl(input: string): boolean {
    try {
        const u = new URL(input);
        if (u.protocol !== "https:") return false;
        return SAFE_AVATAR_HOSTS.some(
            (h) => u.hostname === h || u.hostname.endsWith(`.${h}`),
        );
    } catch {
        return false;
    }
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        const db = await getDatabase();

        // Look up the user's OAuth provider avatar
        const identity = await db
            .prepare(
                "SELECT provider_profile_url FROM identities WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
            )
            .bind(id)
            .first<{ provider_profile_url: string | null }>();

        if (
            identity?.provider_profile_url &&
            isSafeAvatarUrl(identity.provider_profile_url)
        ) {
            return NextResponse.redirect(identity.provider_profile_url, 302);
        }

        // Fallback: get user display name / email for initials-based SVG avatar
        const user = await db
            .prepare("SELECT display_name, email FROM users WHERE id = ?")
            .bind(id)
            .first<{ display_name: string | null; email: string | null }>();

        if (!user) {
            return new NextResponse(null, { status: 404 });
        }

        const initial = (user.display_name || user.email || "?")
            .charAt(0)
            .toUpperCase();

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="64" fill="#1a2e0a"/>
  <text x="64" y="64" dy=".35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="#9b7bf7">${initial}</text>
</svg>`;

        return new NextResponse(svg, {
            status: 200,
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=3600, s-maxage=86400",
            },
        });
    } catch (e) {
        console.error("Avatar route error:", e);
        return new NextResponse(null, { status: 500 });
    }
}
