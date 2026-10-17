export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import {
    hasSufficientContrast,
    isOpaqueHexColor,
    isValidUrl,
    sanitizeString,
    validateBrandAssetUrl,
    validateLogoUrl,
} from "@/lib/branding-validation";
import { getDatabase } from "@/lib/d1-client";
import {
    getOAuthClientById,
    getOAuthClientByIdWithSecret,
    getUserById,
    logAuditEvent,
    updateOAuthClient,
} from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";
import { sendMail } from "@/lib/mails";
import { normalizeOAuthAudience } from "@/lib/oauth-client-registration";
import {
    findScopeOption,
    parseCustomScopes,
    SUPPORTED_PRODUCT_SCOPES,
    validateCustomScopes,
} from "@/lib/oauth-scope-registry";
import { SUPPORTED_OAUTH_SCOPES } from "@/lib/oauth-scopes";
import {
    generateRandomString,
    generateUUID,
    hashString,
} from "@/lib/webcrypto";

async function canManageClient(
    db: Awaited<ReturnType<typeof getDatabase>>,
    app: { owner_id?: string },
    userId: string,
): Promise<boolean> {
    if (app.owner_id === userId) return true;
    if (
        app.owner_id !== "system-lixblogs-cli" &&
        app.owner_id !== "system-lixrl-cli"
    )
        return false;
    const user = await db
        .prepare("SELECT is_internal FROM users WHERE id = ?")
        .bind(userId)
        .first<{ is_internal: number }>();
    return user?.is_internal === 1;
}

/**
 * PUT /api/auth/oauth-clients/[client_id]
 * UPDATE /api/auth/oauth-clients/[client_id]
 *
 * Update OAuth application details
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string }> },
) {
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

        const { client_id } = await params;
        const body: any = await request.json();
        const {
            name,
            redirect_uris,
            scopes,
            description,
            homepage_url,
            logo_url,
            branding_display_name,
            branding_primary_color,
            branding_accent_color,
            privacy_policy_url,
            terms_of_service_url,
            audience,
            custom_scopes,
        } = body;

        if (!client_id) {
            return NextResponse.json(
                { error: "client_id is required" },
                { status: 400 },
            );
        }

        const db = await getDatabase();

        // Verify ownership
        const app = (await getOAuthClientByIdWithSecret(db, client_id)) as any;
        if (!app) {
            return NextResponse.json(
                { error: "Application not found" },
                { status: 404 },
            );
        }
        if (!(await canManageClient(db, app, payload.sub))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Validate redirect URIs if provided
        if (redirect_uris !== undefined) {
            if (
                !Array.isArray(redirect_uris) ||
                (app.client_type !== "public" && redirect_uris.length === 0)
            ) {
                return NextResponse.json(
                    {
                        error: "redirect_uris must be an array; confidential clients require at least one",
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
                } catch {
                    return NextResponse.json(
                        { error: `Invalid redirect_uri: ${uri}` },
                        { status: 400 },
                    );
                }
            }
        }

        let normalizedAudience: string | null | undefined;
        if (audience !== undefined) {
            normalizedAudience = normalizeOAuthAudience(audience);
            if (app.client_type !== "public" || !normalizedAudience) {
                return NextResponse.json(
                    {
                        error:
                            app.client_type !== "public"
                                ? "Audience is only supported for public clients"
                                : "Public clients require a valid host-only audience",
                    },
                    { status: 400 },
                );
            }
        }

        const customScopeResult =
            custom_scopes === undefined
                ? { scopes: JSON.parse(app.custom_scopes || "[]") }
                : validateCustomScopes(custom_scopes);
        if ("error" in customScopeResult) {
            return NextResponse.json(
                { error: customScopeResult.error },
                { status: 400 },
            );
        }
        const customScopeDefinitions = customScopeResult.scopes || [];
        const existingScopes: string[] = JSON.parse(app.scopes || "[]");
        const currentCustomScopes = parseCustomScopes(app.custom_scopes);
        const legacyUnknownScopes = existingScopes.filter(
            (scope) => !findScopeOption(scope, currentCustomScopes),
        );
        const allowedScopes: string[] = [
            ...SUPPORTED_OAUTH_SCOPES,
            ...SUPPORTED_PRODUCT_SCOPES,
            ...customScopeDefinitions.map(
                (scope: { name: string }) => scope.name,
            ),
            ...legacyUnknownScopes,
        ];
        if (
            scopes !== undefined &&
            (!Array.isArray(scopes) ||
                scopes.some(
                    (scope: unknown) =>
                        typeof scope !== "string" ||
                        !allowedScopes.includes(scope),
                ))
        ) {
            return NextResponse.json(
                {
                    error: `scopes must only contain: ${allowedScopes.join(", ")}`,
                },
                { status: 400 },
            );
        }

        // Custom branding validations
        for (const [label, value] of [
            ["Homepage", homepage_url],
            ["Logo", logo_url],
            ["Privacy Policy", privacy_policy_url],
            ["Terms of Service", terms_of_service_url],
        ] as const) {
            if (
                value !== undefined &&
                value !== null &&
                typeof value !== "string"
            ) {
                return NextResponse.json(
                    { error: `${label} URL must be a string` },
                    { status: 400 },
                );
            }
            if (typeof value === "string" && value.length > 2048) {
                return NextResponse.json(
                    { error: `${label} URL is too long` },
                    { status: 400 },
                );
            }
        }
        if (homepage_url !== undefined) {
            if (homepage_url && !isValidUrl(homepage_url)) {
                return NextResponse.json(
                    { error: "Invalid homepage URL" },
                    { status: 400 },
                );
            }
        }
        if (privacy_policy_url !== undefined) {
            if (privacy_policy_url && !isValidUrl(privacy_policy_url)) {
                return NextResponse.json(
                    { error: "Invalid Privacy Policy URL" },
                    { status: 400 },
                );
            }
        }
        if (terms_of_service_url !== undefined) {
            if (terms_of_service_url && !isValidUrl(terms_of_service_url)) {
                return NextResponse.json(
                    { error: "Invalid Terms of Service URL" },
                    { status: 400 },
                );
            }
        }
        const effectiveHomepage =
            homepage_url !== undefined ? homepage_url : app.homepage_url;
        if (logo_url) {
            const logoCheck = validateLogoUrl(logo_url, effectiveHomepage);
            if (!logoCheck.valid) {
                return NextResponse.json(
                    { error: logoCheck.error },
                    { status: 400 },
                );
            }
        }
        for (const [label, value] of [
            ["Privacy Policy", privacy_policy_url],
            ["Terms of Service", terms_of_service_url],
        ] as const) {
            if (!value) continue;
            const result = validateBrandAssetUrl(value, effectiveHomepage);
            if (!result.valid) {
                return NextResponse.json(
                    { error: `${label} URL: ${result.error}` },
                    { status: 400 },
                );
            }
        }
        if (
            branding_display_name !== undefined &&
            branding_display_name !== null &&
            typeof branding_display_name !== "string"
        ) {
            return NextResponse.json(
                { error: "Branding display name must be a string" },
                { status: 400 },
            );
        }
        if (branding_primary_color !== undefined) {
            if (branding_primary_color) {
                if (
                    typeof branding_primary_color !== "string" ||
                    !hasSufficientContrast(branding_primary_color)
                ) {
                    return NextResponse.json(
                        {
                            error: "Primary color has insufficient contrast against both black and white.",
                        },
                        { status: 400 },
                    );
                }
            }
        }
        if (
            branding_accent_color &&
            (typeof branding_accent_color !== "string" ||
                !isOpaqueHexColor(branding_accent_color))
        ) {
            return NextResponse.json(
                {
                    error: "Accent color must be an opaque 3- or 6-digit hex color",
                },
                { status: 400 },
            );
        }

        const trustBearingBrandingChanged =
            (homepage_url !== undefined &&
                (homepage_url || null) !== (app.homepage_url || null)) ||
            (redirect_uris !== undefined &&
                JSON.stringify(redirect_uris) !== app.redirect_uris) ||
            (logo_url !== undefined &&
                (logo_url || null) !== (app.logo_url || null)) ||
            (branding_display_name !== undefined &&
                (branding_display_name || null) !==
                    (app.branding_display_name || null)) ||
            (branding_primary_color !== undefined &&
                (branding_primary_color || null) !==
                    (app.branding_primary_color || null)) ||
            (branding_accent_color !== undefined &&
                (branding_accent_color || null) !==
                    (app.branding_accent_color || null)) ||
            (privacy_policy_url !== undefined &&
                (privacy_policy_url || null) !==
                    (app.privacy_policy_url || null)) ||
            (terms_of_service_url !== undefined &&
                (terms_of_service_url || null) !==
                    (app.terms_of_service_url || null));

        try {
            await updateOAuthClient(db, client_id, {
                ...(name !== undefined && { name }),
                ...(redirect_uris !== undefined && {
                    redirectUris: JSON.stringify(redirect_uris),
                }),
                ...(scopes !== undefined && { scopes: JSON.stringify(scopes) }),
                ...(custom_scopes !== undefined && {
                    customScopes: JSON.stringify(customScopeDefinitions),
                }),
                ...(normalizedAudience !== undefined && {
                    audience: normalizedAudience,
                }),
                ...(description !== undefined && { description }),
                ...(homepage_url !== undefined && {
                    homepageUrl: homepage_url || null,
                }),
                ...(logo_url !== undefined && { logoUrl: logo_url || null }),
                ...(branding_display_name !== undefined && {
                    brandingDisplayName: branding_display_name
                        ? sanitizeString(branding_display_name).slice(0, 50)
                        : null,
                }),
                ...(branding_primary_color !== undefined && {
                    brandingPrimaryColor: branding_primary_color || null,
                }),
                ...(branding_accent_color !== undefined && {
                    brandingAccentColor: branding_accent_color || null,
                }),
                ...(privacy_policy_url !== undefined && {
                    privacyPolicyUrl: privacy_policy_url || null,
                }),
                ...(terms_of_service_url !== undefined && {
                    termsOfServiceUrl: terms_of_service_url || null,
                }),
                ...(trustBearingBrandingChanged && {
                    isBrandingVerified: false,
                    brandingVerifiedDomain: null,
                    brandingVerifiedAt: null,
                }),
            });

            // Log audit event for branding modifications
            if (
                scopes !== undefined ||
                audience !== undefined ||
                branding_display_name !== undefined ||
                branding_primary_color !== undefined ||
                branding_accent_color !== undefined ||
                logo_url !== undefined ||
                privacy_policy_url !== undefined ||
                terms_of_service_url !== undefined
            ) {
                await logAuditEvent(db, {
                    id: generateUUID(),
                    userId: payload.sub,
                    eventType:
                        scopes !== undefined || audience !== undefined
                            ? "client.registration_updated"
                            : "client.branding_updated",
                    provider: client_id,
                    status: "success",
                }).catch(() => {});
            }
        } catch (error) {
            console.error("[OAuth Client] Database update error:", error);
            return NextResponse.json(
                { error: "Failed to update application" },
                { status: 500 },
            );
        }

        const updated = (await getOAuthClientById(db, client_id)) as any;
        return NextResponse.json({
            client_id,
            name: updated?.name,
            description: updated?.description,
            homepage_url: updated?.homepage_url,
            redirect_uris: JSON.parse(updated?.redirect_uris || "[]"),
            scopes: JSON.parse(updated?.scopes || "[]"),
            custom_scopes: JSON.parse(updated?.custom_scopes || "[]"),
            is_active: Boolean(updated?.is_active),
            client_type: updated?.client_type || "confidential",
            token_endpoint_auth_method:
                updated?.client_type === "public"
                    ? "none"
                    : "client_secret_post",
            audience: updated?.audience || null,
            request_count: updated?.request_count ?? 0,
            last_used: updated?.last_used,
            logo_url: updated?.logo_url || null,
            branding_display_name: updated?.branding_display_name || null,
            branding_primary_color: updated?.branding_primary_color || null,
            branding_accent_color: updated?.branding_accent_color || null,
            privacy_policy_url: updated?.privacy_policy_url || null,
            terms_of_service_url: updated?.terms_of_service_url || null,
            is_branding_verified: updated?.is_branding_verified === 1,
            branding_verified_domain: updated?.branding_verified_domain || null,
            branding_verified_at: updated?.branding_verified_at || null,
        });
    } catch (error) {
        console.error("[OAuth Client] Update error:", error);
        return NextResponse.json(
            { error: "Failed to update application" },
            { status: 500 },
        );
    }
}

/**
 * PATCH /api/auth/oauth-clients/[client_id]
 *
 * Regenerate the client secret for an OAuth application
 * Returns the new secret (shown only once)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string }> },
) {
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

        const { client_id } = await params;

        if (!client_id) {
            return NextResponse.json(
                { error: "client_id is required" },
                { status: 400 },
            );
        }

        const db = await getDatabase();

        // Verify ownership
        const app = (await getOAuthClientByIdWithSecret(db, client_id)) as any;
        if (!app) {
            return NextResponse.json(
                { error: "Application not found" },
                { status: 404 },
            );
        }
        if (!(await canManageClient(db, app, payload.sub))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (app.client_type === "public") {
            return NextResponse.json(
                { error: "Public clients do not use client secrets" },
                { status: 400 },
            );
        }

        // Generate new secret
        const newSecret = `secret_${generateRandomString(64)}`;
        const newSecretHash = await hashString(newSecret);

        await updateOAuthClient(db, client_id, {
            clientSecretHash: newSecretHash,
        });

        console.log("[OAuth Client] Secret regenerated for: %s", client_id);

        return NextResponse.json({
            client_id,
            client_secret: newSecret,
            _notice:
                "Store this secret securely. It will NOT be retrievable after this response.",
        });
    } catch (error) {
        console.error("[OAuth Client] Secret regeneration error:", error);
        return NextResponse.json(
            { error: "Failed to regenerate secret" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/auth/oauth-clients/[client_id]
 *
 * Deactivate an OAuth application
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string }> },
) {
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

        const { client_id } = await params;

        if (!client_id) {
            return NextResponse.json(
                { error: "client_id is required" },
                { status: 400 },
            );
        }

        const db = await getDatabase();

        // Verify ownership
        const app = (await getOAuthClientByIdWithSecret(db, client_id)) as any;
        if (!app) {
            return NextResponse.json(
                { error: "Application not found" },
                { status: 404 },
            );
        }
        if (!(await canManageClient(db, app, payload.sub))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        try {
            await updateOAuthClient(db, client_id, { isActive: false });
        } catch (error) {
            console.error("[OAuth Client] Database delete error:", error);
            return NextResponse.json(
                { error: "Failed to delete application" },
                { status: 500 },
            );
        }

        console.log("[OAuth Client] Deactivated: %s", client_id);

        // Notify owner via email (fire-and-forget)
        try {
            const owner = (await getUserById(db, payload.sub)) as any;
            if (owner?.email) {
                const ownerName =
                    owner.display_name || owner.email.split("@")[0];
                const APP_URL =
                    process.env.NEXT_PUBLIC_APP_URL ||
                    "https://accounts.elixpo.com";
                await sendMail("oauth_app_delete", owner.email, {
                    name: ownerName,
                    app_name: app.name,
                    client_id_short: client_id.slice(0, 20),
                    dashboard_url: `${APP_URL}/dashboard/oauth-apps`,
                });
            }
        } catch (emailError) {
            console.error(
                "[OAuth Client] Failed to send deactivation email:",
                emailError,
            );
        }

        return NextResponse.json({
            message: "Application deactivated successfully",
            client_id,
        });
    } catch (error) {
        console.error("[OAuth Client] Delete error:", error);
        return NextResponse.json(
            { error: "Failed to delete application" },
            { status: 500 },
        );
    }
}

/**
 * GET /api/auth/oauth-clients/[client_id]
 *
 * Get OAuth application details (public info only)
 * Query params:
 *   - validate_redirect_uri: optional redirect URI to validate against registered URIs
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ client_id: string }> },
) {
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

        const { client_id } = await params;
        const validateRedirectUri = request.nextUrl.searchParams.get(
            "validate_redirect_uri",
        );

        if (!client_id) {
            return NextResponse.json(
                { error: "client_id is required" },
                { status: 400 },
            );
        }

        // Get from D1
        let app: any = null;
        let canManage = false;
        let auditHistory: Array<{
            event_type: string;
            status: string;
            created_at: string;
        }> = [];
        try {
            const db = await getDatabase();
            app = await getOAuthClientByIdWithSecret(db, client_id);
            if (!app) {
                return NextResponse.json(
                    { error: "Application not found" },
                    { status: 404 },
                );
            }
            canManage = await canManageClient(db, app, payload.sub);
            if (canManage) {
                const history = await db
                    .prepare(
                        `SELECT event_type, status, created_at
                         FROM audit_logs
                         WHERE provider = ?
                         ORDER BY created_at DESC
                         LIMIT 20`,
                    )
                    .bind(client_id)
                    .all<{
                        event_type: string;
                        status: string;
                        created_at: string;
                    }>();
                auditHistory = history.results || [];
            }
            if (!(app as any).is_active && !canManage) {
                return NextResponse.json(
                    { error: "Application is inactive" },
                    { status: 403 },
                );
            }
        } catch (error) {
            console.error("[OAuth Client] Database get error:", error);
            return NextResponse.json(
                { error: "Failed to fetch application" },
                { status: 500 },
            );
        }

        const redirect_uris = JSON.parse((app as any).redirect_uris || "[]");
        const scopes = JSON.parse((app as any).scopes || "[]");

        // Validate redirect URI if provided
        if (validateRedirectUri) {
            if (!redirect_uris.includes(validateRedirectUri)) {
                return NextResponse.json(
                    {
                        error: "Invalid redirect URI",
                        message: `The provided redirect_uri is not registered for this application`,
                        registeredUris: redirect_uris,
                    },
                    { status: 400 },
                );
            }
        }

        // Return full data (owner gets extra fields, others get public subset)
        const isOwner = canManage;
        return NextResponse.json({
            client_id,
            name: (app as any).name,
            description: (app as any).description || null,
            homepage_url: (app as any).homepage_url || null,
            redirect_uris,
            scopes,
            custom_scopes: JSON.parse((app as any).custom_scopes || "[]"),
            is_active: Boolean((app as any).is_active),
            client_type: (app as any).client_type || "confidential",
            token_endpoint_auth_method:
                (app as any).client_type === "public"
                    ? "none"
                    : "client_secret_post",
            audience: (app as any).audience || null,
            created_at: (app as any).created_at,
            ...(isOwner && {
                logo_url: (app as any).logo_url,
                request_count: (app as any).request_count ?? 0,
                last_used: (app as any).last_used,
                branding_display_name:
                    (app as any).branding_display_name || null,
                branding_primary_color:
                    (app as any).branding_primary_color || null,
                branding_accent_color:
                    (app as any).branding_accent_color || null,
                privacy_policy_url: (app as any).privacy_policy_url || null,
                terms_of_service_url: (app as any).terms_of_service_url || null,
                is_branding_verified: (app as any).is_branding_verified === 1,
                branding_verified_domain:
                    (app as any).branding_verified_domain || null,
                branding_verified_at: (app as any).branding_verified_at || null,
                owner_id: (app as any).owner_id,
                audit_history: auditHistory,
            }),
        });
    } catch (error) {
        console.error("[OAuth Client] Get error:", error);
        return NextResponse.json(
            { error: "Failed to fetch application" },
            { status: 500 },
        );
    }
}
