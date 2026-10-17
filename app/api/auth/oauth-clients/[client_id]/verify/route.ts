export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import {
    getBrandDomain,
    hasSufficientContrast,
    isOpaqueHexColor,
    validateBrandAssetUrl,
    validateRedirectDomains,
} from "@/lib/branding-validation";
import { getDatabase } from "@/lib/d1-client";
import { getOAuthClientByIdWithSecret, logAuditEvent } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";
import { checkBrandingVerificationRateLimit } from "@/lib/rate-limit-middleware";
import { generateUUID } from "@/lib/webcrypto";

type DnsJsonResponse = {
    Status?: number;
    Answer?: Array<{ type?: number; data?: string }>;
};

function normalizeTxtRecord(value: string): string {
    return value.replace(/^"|"$/g, "").replace(/\\"/g, '"');
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string }> },
) {
    try {
        const token = request.cookies.get("access_token")?.value;
        if (!token) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const payload = await verifyJWT(token);
        if (payload?.type !== "access") {
            return NextResponse.json(
                { error: "Invalid token" },
                { status: 401 },
            );
        }

        const { client_id: clientId } = await params;
        if (!clientId) {
            return NextResponse.json(
                { error: "client_id is required" },
                { status: 400 },
            );
        }

        const db = await getDatabase();
        const rateLimit = await checkBrandingVerificationRateLimit(
            db,
            `owner:${payload.sub}`,
        );
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: "Too many verification attempts" },
                {
                    status: 429,
                    headers: rateLimit.retryAfter
                        ? { "Retry-After": String(rateLimit.retryAfter) }
                        : undefined,
                },
            );
        }

        const app = await getOAuthClientByIdWithSecret(db, clientId);
        if (!app) {
            return NextResponse.json(
                { error: "Application not found" },
                { status: 404 },
            );
        }
        if (String(app.owner_id) !== payload.sub) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const homepageUrl = String(app.homepage_url || "");
        const verifiedDomain = getBrandDomain(homepageUrl);
        if (!verifiedDomain) {
            return NextResponse.json(
                { error: "A public HTTPS homepage is required" },
                { status: 400 },
            );
        }

        let redirectUris: string[];
        try {
            redirectUris = JSON.parse(String(app.redirect_uris || "[]"));
        } catch {
            return NextResponse.json(
                { error: "Registered redirect URIs are malformed" },
                { status: 400 },
            );
        }
        if (!validateRedirectDomains(homepageUrl, redirectUris)) {
            return NextResponse.json(
                {
                    error: `Every redirect URI must use ${verifiedDomain} or one of its subdomains`,
                },
                { status: 400 },
            );
        }

        for (const [label, value] of [
            ["Logo", app.logo_url],
            ["Privacy Policy", app.privacy_policy_url],
            ["Terms of Service", app.terms_of_service_url],
        ] as const) {
            if (!value) continue;
            const result = validateBrandAssetUrl(String(value), homepageUrl);
            if (!result.valid) {
                return NextResponse.json(
                    { error: `${label}: ${result.error}` },
                    { status: 400 },
                );
            }
        }
        if (
            app.branding_primary_color &&
            !hasSufficientContrast(String(app.branding_primary_color))
        ) {
            return NextResponse.json(
                { error: "Primary color is invalid or inaccessible" },
                { status: 400 },
            );
        }
        if (
            app.branding_accent_color &&
            !isOpaqueHexColor(String(app.branding_accent_color))
        ) {
            return NextResponse.json(
                { error: "Accent color must be an opaque hex color" },
                { status: 400 },
            );
        }

        const recordName = `_elixpo-challenge.${verifiedDomain}`;
        const expectedValue = `elixpo-verification=${clientId}`;
        const dnsUrl =
            "https://cloudflare-dns.com/dns-query?" +
            new URLSearchParams({ name: recordName, type: "TXT" }).toString();

        const response = await fetch(dnsUrl, {
            headers: { Accept: "application/dns-json" },
            cache: "no-store",
        });
        if (!response.ok) {
            return NextResponse.json(
                { error: "DNS verification service is unavailable" },
                { status: 502 },
            );
        }

        const dns = (await response.json()) as DnsJsonResponse;
        const verified = (dns.Answer || []).some(
            (answer) =>
                answer.type === 16 &&
                typeof answer.data === "string" &&
                normalizeTxtRecord(answer.data) === expectedValue,
        );
        if (!verified) {
            return NextResponse.json(
                {
                    error: `TXT record ${recordName} must equal ${expectedValue}`,
                },
                { status: 400 },
            );
        }

        const result = await db
            .prepare(
                `UPDATE oauth_clients
                 SET is_branding_verified = 1,
                     branding_verified_domain = ?,
                     branding_verified_at = CURRENT_TIMESTAMP
                 WHERE client_id = ?
                   AND owner_id = ?
                   AND homepage_url = ?
                   AND redirect_uris = ?
                   AND logo_url IS ?
                   AND branding_display_name IS ?
                   AND branding_primary_color IS ?
                   AND branding_accent_color IS ?
                   AND privacy_policy_url IS ?
                   AND terms_of_service_url IS ?`,
            )
            .bind(
                verifiedDomain,
                clientId,
                payload.sub,
                homepageUrl,
                String(app.redirect_uris),
                app.logo_url ?? null,
                app.branding_display_name ?? null,
                app.branding_primary_color ?? null,
                app.branding_accent_color ?? null,
                app.privacy_policy_url ?? null,
                app.terms_of_service_url ?? null,
            )
            .run();

        if (result.meta.changes !== 1) {
            return NextResponse.json(
                {
                    error: "Application settings changed during verification; try again",
                },
                { status: 409 },
            );
        }

        await logAuditEvent(db, {
            id: generateUUID(),
            userId: payload.sub,
            eventType: "client.branding_verified",
            provider: clientId,
            status: "success",
        }).catch(() => {});

        return NextResponse.json({
            ok: true,
            verified_domain: verifiedDomain,
            message: "Custom branding domain verified",
        });
    } catch (error) {
        console.error("[OAuth Client] Branding verification failed:", error);
        return NextResponse.json(
            { error: "Branding verification failed" },
            { status: 500 },
        );
    }
}
