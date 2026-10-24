export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import {
    createOAuthClient,
    getOAuthClientById,
    getUserById,
    logAuditEvent,
} from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";
import { sendMail } from "@/lib/mails";
import { normalizeOAuthAudience } from "@/lib/oauth-client-registration";
import {
    SUPPORTED_PRODUCT_SCOPES,
    validateCustomScopes,
} from "@/lib/oauth-scope-registry";
import { SUPPORTED_OAUTH_SCOPES } from "@/lib/oauth-scopes";
import {
    generateRandomString,
    generateUUID,
    hashString,
} from "@/lib/webcrypto";

async function getAuth(request: NextRequest) {
    const token =
        request.cookies.get("access_token")?.value ||
        request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;
    const payload = await verifyJWT(token);
    if (payload?.type !== "access") return null;
    return payload;
}

/**
 * POST /api/auth/oauth-clients
 *
 * Register a new OAuth 2.0 application
 * Third-party services use this endpoint to register for sign in/sign up
 *
 * Returns: { client_id, client_secret }
 *
 * IMPORTANT: Store client_secret securely. It will NOT be retrievable after first creation.
 *
 * Request body:
 * {
 *   "name": "My Service Name",
 *   "redirect_uris": ["https://myservice.com/auth/callback"],
 *   "logo_url": "https://myservice.com/logo.png", (optional)
 *   "description": "Brief description of your service", (optional)
 *   "client_type": "confidential" | "public", (optional; defaults to confidential)
 *   "scopes": ["openid", "profile", "email"]
 * }
 *
 * Response:
 * {
 *   "client_id": "cli_xxxxx",
 *   "client_secret": "secret_xxxxx",
 *   "name": "My Service Name",
 *   "redirect_uris": ["https://myservice.com/auth/callback"],
 *   "scopes": ["openid", "profile", "email"],
 *   "created_at": "2026-02-21T10:00:00Z"
 * }
 */
export async function POST(request: NextRequest) {
    const auth = await getAuth(request);
    if (!auth)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const db = await getDatabase();
        const user = (await getUserById(db, auth.sub)) as any;
        if (user && !user.email_verified) {
            return NextResponse.json(
                {
                    error: "Please verify your email address before registering an OAuth application.",
                },
                { status: 403 },
            );
        }

        // Count owned apps once — used by both the 2FA gate and the
        // tier-limit gate below.
        const countRow = (await db
            .prepare(
                `SELECT COUNT(*) AS n FROM oauth_clients
                 WHERE owner_id = ? AND is_active = 1`,
            )
            .bind(auth.sub)
            .first()) as { n: number } | null;
        const activeCount = countRow?.n ?? 0;

        // 2FA gate. The platform policy mandates 2FA for any account
        // owning ≥3 OAuth apps. We enforce at creation time of the 3rd
        // app: if the user has 2 apps and !mfa_enabled, block here with
        // a hint that points them to /dashboard/security.
        if (user && !user.mfa_enabled && activeCount >= 2) {
            return NextResponse.json(
                {
                    error: "Enable 2FA before registering a 3rd OAuth app.",
                    mfa_required: true,
                    setup_url: "/dashboard/security",
                },
                { status: 403 },
            );
        }

        // Tier-limit gate. /pricing promises specific app counts per
        // tier (3 / 10 / unlimited) — enforce them here so the promise
        // is real. Pulls tier + is_internal + tier_cancelled_at off the
        // users row (mirrored from payouts.elixpo entitlements).
        const tierRow = (await db
            .prepare(
                "SELECT tier, is_internal, tier_cancelled_at FROM users WHERE id = ?",
            )
            .bind(auth.sub)
            .first()) as {
            tier: string | null;
            is_internal: number;
            tier_cancelled_at: string | null;
        } | null;
        const { tierFromUserRow, TIER_LIMITS } = await import("@/lib/billing");
        const tier = tierFromUserRow(tierRow);
        const cap = TIER_LIMITS[tier].maxOAuthApps;

        // Cancellation-state gate. A buyer who cancelled their paid sub
        // keeps every app they ever created — but they CAN'T add new
        // ones until they resubscribe. This is the platform commitment:
        // "your existing apps stay, but new registrations require an
        // active subscription". Internal accounts skip this gate.
        const cancelled = !!tierRow?.tier_cancelled_at && !tierRow.is_internal;
        if (cancelled) {
            return NextResponse.json(
                {
                    error: "Your subscription is cancelled. Existing OAuth apps stay live, but registering new ones needs an active subscription. Resubscribe from /pricing to continue.",
                    subscription_cancelled: true,
                    current_tier: tier,
                    upgrade_url: "/pricing",
                },
                { status: 403 },
            );
        }

        if (Number.isFinite(cap) && activeCount >= cap) {
            // Distinguish "at-cap on current tier" from "over-cap from a
            // downgrade" — the second case is informational ("you keep
            // them, but no more until you upgrade"), the first is just a
            // promise of the current plan.
            const overFromDowngrade = activeCount > cap;
            return NextResponse.json(
                {
                    error: overFromDowngrade
                        ? `You have ${activeCount} OAuth apps from a previous higher tier. Your current ${tier} plan covers ${cap}. The existing apps stay; upgrade to register more.`
                        : `Your ${tier} plan is limited to ${cap} OAuth apps. Upgrade to register more.`,
                    tier_limit_exceeded: true,
                    over_from_downgrade: overFromDowngrade,
                    current_tier: tier,
                    current_count: activeCount,
                    limit: cap,
                    upgrade_url: "/pricing",
                },
                { status: 403 },
            );
        }

        const body: any = await request.json();
        const {
            name,
            redirect_uris,
            logo_url,
            logo_uri,
            description,
            homepage_url,
            scopes,
            client_type = "confidential",
            audience,
            custom_scopes,
        } = body;
        const requestedLogoUrl = logo_url ?? logo_uri;
        // Webhooks are no longer set at registration time. Use
        // POST /api/auth/oauth-clients/:client_id/webhooks to add one or
        // more endpoints after the app is created. An app can now have
        // multiple endpoints (e.g. localhost + production), each with its
        // own secret and event subscription.

        if (client_type !== "confidential" && client_type !== "public") {
            return NextResponse.json(
                { error: "client_type must be confidential or public" },
                { status: 400 },
            );
        }
        const normalizedAudience = normalizeOAuthAudience(audience);
        if (
            (client_type === "public" && !normalizedAudience) ||
            (client_type === "confidential" && audience)
        ) {
            return NextResponse.json(
                {
                    error:
                        client_type === "public"
                            ? "Public clients require a valid host-only audience"
                            : "Audience is only supported for public clients",
                },
                { status: 400 },
            );
        }

        // Device-only public clients do not require browser redirect URIs.
        if (
            !name ||
            !Array.isArray(redirect_uris) ||
            (client_type === "confidential" && redirect_uris.length === 0)
        ) {
            return NextResponse.json(
                {
                    error: "name and redirect_uris are required; confidential clients need at least one redirect URI",
                },
                { status: 400 },
            );
        }

        if (redirect_uris.length > 5) {
            return NextResponse.json(
                { error: "Maximum of 5 redirect URIs allowed" },
                { status: 400 },
            );
        }

        let validLogoUrl: string | undefined;
        if (requestedLogoUrl != null && requestedLogoUrl !== "") {
            if (typeof requestedLogoUrl !== "string") {
                return NextResponse.json(
                    { error: "logo_url must be a URL string" },
                    { status: 400 },
                );
            }
            try {
                const parsed = new URL(requestedLogoUrl.trim());
                if (
                    parsed.protocol !== "https:" &&
                    parsed.protocol !== "http:"
                ) {
                    return NextResponse.json(
                        { error: "logo_url must use HTTP or HTTPS" },
                        { status: 400 },
                    );
                }
                validLogoUrl = parsed.toString();
            } catch {
                return NextResponse.json(
                    { error: "logo_url must be a valid URL" },
                    { status: 400 },
                );
            }
        }

        // Validate redirect URIs are valid URLs (HTTP and HTTPS allowed)
        const validUris: string[] = [];
        for (const uri of redirect_uris) {
            try {
                const parsed = new URL(uri);
                if (
                    parsed.protocol !== "https:" &&
                    parsed.protocol !== "http:"
                ) {
                    return NextResponse.json(
                        {
                            error: `Redirect URI must use HTTP or HTTPS: ${uri}`,
                        },
                        { status: 400 },
                    );
                }
                validUris.push(uri);
            } catch {
                return NextResponse.json(
                    { error: `Invalid redirect_uri: ${uri}` },
                    { status: 400 },
                );
            }
        }

        // Validate scopes if provided
        const customScopeResult = validateCustomScopes(custom_scopes);
        if ("error" in customScopeResult) {
            return NextResponse.json(
                { error: customScopeResult.error },
                { status: 400 },
            );
        }
        const customScopeDefinitions = customScopeResult.scopes;
        const validScopes: string[] = [
            ...SUPPORTED_OAUTH_SCOPES,
            ...SUPPORTED_PRODUCT_SCOPES,
            ...customScopeDefinitions.map((scope) => scope.name),
        ];
        const registeredScopes = scopes || [...SUPPORTED_OAUTH_SCOPES];
        if (scopes !== undefined && !Array.isArray(scopes)) {
            return NextResponse.json(
                { error: "scopes must be an array" },
                { status: 400 },
            );
        }
        if (Array.isArray(scopes)) {
            for (const scope of scopes) {
                if (typeof scope !== "string" || !validScopes.includes(scope)) {
                    return NextResponse.json(
                        {
                            error: `Invalid scope: ${scope}. Valid scopes: ${validScopes.join(", ")}`,
                        },
                        { status: 400 },
                    );
                }
            }
        }

        // Generate secure credentials
        const clientId = `cli_${generateRandomString(32)}`;
        const clientSecret =
            client_type === "confidential"
                ? `secret_${generateRandomString(64)}`
                : null;
        // The legacy schema keeps this column NOT NULL. Public clients receive
        // no secret; an unexposed random value prevents an empty/shared hash.
        const clientSecretHash = await hashString(
            clientSecret || generateRandomString(64),
        );

        const now = new Date().toISOString();

        try {
            await createOAuthClient(db, {
                clientId,
                clientSecretHash,
                name,
                redirectUris: JSON.stringify(validUris),
                scopes: JSON.stringify(registeredScopes),
                ownerId: auth.sub,
                description,
                homepageUrl: homepage_url,
                logoUrl: validLogoUrl,
                webhookUrl: null,
                webhookSecretHash: null,
                webhookEvents: null,
                clientType: client_type,
                audience: normalizedAudience,
                customScopes: JSON.stringify(customScopeDefinitions),
            });
            await logAuditEvent(db, {
                id: generateUUID(),
                userId: auth.sub,
                eventType: "client.registered",
                provider: clientId,
                status: "success",
            }).catch(() => {});
            console.log("[OAuth Client] Registered: %s (%s)", name, clientId);

            // Notify owner via email (fire-and-forget)
            try {
                const owner = (await getUserById(db, auth.sub)) as any;
                if (owner?.email) {
                    const ownerName =
                        owner.display_name || owner.email.split("@")[0];
                    const APP_URL =
                        process.env.NEXT_PUBLIC_APP_URL ||
                        "https://accounts.elixpo.com";
                    await sendMail("oauth_app_register", owner.email, {
                        name: ownerName,
                        app_name: name,
                        client_id_short: clientId.slice(0, 20),
                        dashboard_url: `${APP_URL}/dashboard/oauth-apps/${clientId}`,
                    });
                }
            } catch (emailError) {
                console.error(
                    "[OAuth Client] Failed to send registration email:",
                    emailError,
                );
            }
        } catch (dbError) {
            console.error("[OAuth Client] Database storage error:", dbError);
            return NextResponse.json(
                { error: "Failed to register application" },
                { status: 500 },
            );
        }

        // Return credentials (client_secret shown only once)
        return NextResponse.json(
            {
                client_id: clientId,
                ...(clientSecret && { client_secret: clientSecret }),
                client_type,
                audience: normalizedAudience,
                name,
                redirect_uris: validUris,
                homepage_url,
                logo_uri,
                description,
                scopes: registeredScopes,
                custom_scopes: customScopeDefinitions,
                created_at: now,
                _notice: clientSecret
                    ? "Store client_secret securely. It will NOT be retrievable."
                    : "Public clients use token endpoint authentication method none; no client secret was issued.",
            },
            { status: 201 },
        );
    } catch (error) {
        console.error("[OAuth Client] Registration error:", error);
        return NextResponse.json(
            { error: "Failed to register application" },
            { status: 500 },
        );
    }
}

/**
 * GET /api/auth/oauth-clients?client_id=cli_xxx
 *
 * Get application details (public info only, no secret)
 * This is used by the authorization server to validate client credentials
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const clientId = searchParams.get("client_id");

        if (!clientId) {
            return NextResponse.json(
                { error: "client_id is required" },
                { status: 400 },
            );
        }

        // Fetch from D1
        const db = await getDatabase();
        const client = await getOAuthClientById(db, clientId);
        if (!client) {
            return NextResponse.json(
                { error: "Client not found" },
                { status: 404 },
            );
        }

        const brandingVerified = (client as any).is_branding_verified === 1;

        // Custom branding is public only after domain verification. This
        // keeps every consumer safe even if it forgets to check the flag.
        return NextResponse.json({
            client_id: clientId,
            name: (client as any).name,
            description: (client as any).description || null,
            homepage_url: (client as any).homepage_url || null,
            redirect_uris: JSON.parse((client as any).redirect_uris || "[]"),
            scopes: JSON.parse((client as any).scopes || "[]"),
            custom_scopes: JSON.parse((client as any).custom_scopes || "[]"),
            created_at: (client as any).created_at,
            is_active: (client as any).is_active,
            client_type: (client as any).client_type || "confidential",
            token_endpoint_auth_method:
                (client as any).client_type === "public"
                    ? "none"
                    : "client_secret_post",
            audience: (client as any).audience || null,
            logo_url: brandingVerified
                ? (client as any).logo_url || null
                : null,
            branding_display_name: brandingVerified
                ? (client as any).branding_display_name || null
                : null,
            branding_primary_color: brandingVerified
                ? (client as any).branding_primary_color || null
                : null,
            branding_accent_color: brandingVerified
                ? (client as any).branding_accent_color || null
                : null,
            privacy_policy_url: brandingVerified
                ? (client as any).privacy_policy_url || null
                : null,
            terms_of_service_url: brandingVerified
                ? (client as any).terms_of_service_url || null
                : null,
            is_branding_verified: brandingVerified,
            branding_verified_domain: brandingVerified
                ? (client as any).branding_verified_domain || null
                : null,
        });
    } catch (error) {
        console.error("[OAuth Client] Get error:", error);
        return NextResponse.json(
            { error: "Failed to get client details" },
            { status: 500 },
        );
    }
}
