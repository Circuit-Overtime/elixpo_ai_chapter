export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import {
    authenticateOAuthClient,
    getOAuthClientByIdWithSecret,
    getUserById,
    logAuditEvent,
    createRefreshToken as storeRefreshToken,
} from "@/lib/db";
import { classifyDevicePollAttempt } from "@/lib/device-auth-service";
import {
    createAccessToken,
    createIdToken,
    createRefreshToken,
} from "@/lib/jwt";
import { parseOAuthScopes } from "@/lib/oauth-scopes";
import { verifyS256CodeChallenge } from "@/lib/pkce";
import { rotateRefreshToken } from "@/lib/refresh-rotation";
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

        const {
            grant_type,
            code,
            client_id,
            client_secret,
            redirect_uri,
            refresh_token,
            device_code,
            scope,
            code_verifier,
        } = body;

        if (!grant_type) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description: "grant_type is required",
                },
                { status: 400 },
            );
        }

        // Authorization Code Flow (RFC 6749 Section 4.1)
        if (grant_type === "authorization_code") {
            if (!code || !client_id || !redirect_uri) {
                return NextResponse.json(
                    {
                        error: "invalid_request",
                        error_description:
                            "Missing required parameters: code, client_id, redirect_uri",
                    },
                    { status: 400 },
                );
            }

            const db = await getDatabase();

            try {
                const client = await getOAuthClientByIdWithSecret(
                    db,
                    client_id,
                );
                const clientType = (client as { client_type?: string } | null)
                    ?.client_type;
                const validClient = await authenticateOAuthClient(
                    db,
                    client_id,
                    typeof client_secret === "string"
                        ? await hashString(client_secret)
                        : null,
                );
                if (!client || !validClient) {
                    return NextResponse.json(
                        {
                            error: "invalid_client",
                            error_description: "Invalid client credentials",
                        },
                        { status: 401 },
                    );
                }

                const redirectUris = JSON.parse(
                    (client as { redirect_uris?: string }).redirect_uris ||
                        "[]",
                );
                if (!redirectUris.includes(redirect_uri)) {
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description: "redirect_uri does not match",
                        },
                        { status: 400 },
                    );
                }

                const authRequest = (await db
                    .prepare(
                        "SELECT * FROM auth_requests WHERE code = ? AND client_id = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP",
                    )
                    .bind(code, client_id)
                    .first()) as {
                    user_id: string | null;
                    redirect_uri: string;
                    scopes: string | null;
                    nonce: string | null;
                    code_challenge: string | null;
                    code_challenge_method: string | null;
                } | null;

                if (!authRequest || authRequest.redirect_uri !== redirect_uri) {
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description:
                                "Authorization code not found, expired, used, or mismatched",
                        },
                        { status: 400 },
                    );
                }

                if (
                    authRequest.code_challenge &&
                    (authRequest.code_challenge_method !== "S256" ||
                        typeof code_verifier !== "string" ||
                        !(await verifyS256CodeChallenge(
                            code_verifier,
                            authRequest.code_challenge,
                        )))
                ) {
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description: "PKCE verification failed",
                        },
                        { status: 400 },
                    );
                }
                if (clientType === "public" && !authRequest.code_challenge) {
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description:
                                "PKCE was not bound to this authorization code",
                        },
                        { status: 400 },
                    );
                }
                if (
                    typeof code_verifier === "string" &&
                    !authRequest.code_challenge
                ) {
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description:
                                "PKCE was not bound to this authorization code",
                        },
                        { status: 400 },
                    );
                }

                const claim = await db
                    .prepare(
                        "UPDATE auth_requests SET used = 1 WHERE code = ? AND client_id = ? AND used = 0",
                    )
                    .bind(code, client_id)
                    .run();
                if (claim.meta.changes !== 1 || !authRequest.user_id) {
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description:
                                "Authorization code is no longer valid",
                        },
                        { status: 400 },
                    );
                }

                const user = (await getUserById(db, authRequest.user_id)) as {
                    email: string;
                    email_verified?: number;
                    display_name?: string | null;
                    username?: string | null;
                } | null;
                if (!user) {
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description: "User not found",
                        },
                        { status: 400 },
                    );
                }

                try {
                    const { recordMauHit } = await import("@/lib/mau");
                    await recordMauHit(db, client_id, authRequest.user_id);
                } catch {
                    /* best-effort */
                }

                const authorizedScopes = parseOAuthScopes(
                    authRequest.scopes || "openid profile email",
                );
                const scopes = scope
                    ? parseOAuthScopes(scope)
                    : authorizedScopes;
                if (scopes.some((item) => !authorizedScopes.includes(item))) {
                    return NextResponse.json(
                        {
                            error: "invalid_scope",
                            error_description:
                                "Requested scope exceeds the user's authorization grant",
                        },
                        { status: 400 },
                    );
                }

                const sessionId = generateUUID();
                const oauthClaims = {
                    clientId: client_id,
                    audience:
                        (client as { audience?: string | null }).audience ||
                        undefined,
                    sid: sessionId,
                };
                const accessToken = await createAccessToken(
                    authRequest.user_id,
                    user.email,
                    "email",
                    parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10),
                    scopes,
                    oauthClaims,
                );
                const refreshTokenJWT = await createRefreshToken(
                    authRequest.user_id,
                    "email",
                    parseInt(
                        process.env.REFRESH_TOKEN_EXPIRATION_DAYS || "30",
                        10,
                    ),
                    scopes,
                    oauthClaims,
                );
                const idToken = scopes.includes("openid")
                    ? await createIdToken(
                          authRequest.user_id,
                          user.email,
                          client_id,
                          parseInt(
                              process.env.JWT_EXPIRATION_MINUTES || "15",
                              10,
                          ),
                          {
                              nonce: authRequest.nonce || undefined,
                              emailVerified: !!user.email_verified,
                              name: user.display_name,
                              preferredUsername: user.username,
                          },
                      )
                    : undefined;

                await storeRefreshToken(db, {
                    id: generateUUID(),
                    userId: authRequest.user_id,
                    tokenHash: await hashString(refreshTokenJWT),
                    clientId: client_id,
                    expiresAt: new Date(
                        Date.now() +
                            parseInt(
                                process.env.REFRESH_TOKEN_EXPIRATION_DAYS ||
                                    "30",
                                10,
                            ) *
                                86_400_000,
                    ),
                    familyId: sessionId,
                    sid: sessionId,
                });

                return NextResponse.json({
                    access_token: accessToken,
                    token_type: "Bearer",
                    expires_in:
                        parseInt(
                            process.env.JWT_EXPIRATION_MINUTES || "15",
                            10,
                        ) * 60,
                    refresh_token: refreshTokenJWT,
                    scope: scopes.join(" "),
                    ...(idToken ? { id_token: idToken } : {}),
                });
            } catch (error) {
                console.error("[Token] Authorization code flow error:", error);
                return NextResponse.json(
                    {
                        error: "server_error",
                        error_description: "Failed to process token request",
                    },
                    { status: 500 },
                );
            }
        }

        // Refresh Token Flow (RFC 6749 Section 6)
        if (grant_type === "refresh_token") {
            if (!refresh_token || !client_id) {
                return NextResponse.json(
                    {
                        error: "invalid_request",
                        error_description:
                            "Missing required parameters: refresh_token, client_id",
                    },
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
                    {
                        error: "invalid_client",
                        error_description: "Invalid client credentials",
                    },
                    { status: 401 },
                );
            }

            const ipAddress =
                request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
                request.headers.get("cf-connecting-ip") ||
                "unknown";
            const result = await rotateRefreshToken(db, {
                refreshTokenJWT: refresh_token,
                clientId: client_id,
                clientAudience:
                    (client as { audience?: string | null }).audience ||
                    undefined,
                ipAddress,
                userAgent: request.headers.get("user-agent") || "unknown",
                scopes: scope ? parseOAuthScopes(scope) : undefined,
            });

            if ("error" in result) {
                return NextResponse.json(
                    {
                        error: result.error,
                        error_description: result.error_description,
                    },
                    { status: result.status },
                );
            }
            return NextResponse.json(result);
        }

        // Device Authorization Grant (RFC 8628) — accounts.elixpo#80.
        // Additive `if` block, same shape as authorization_code/
        // refresh_token above: independent early-return, not `else if`,
        // so inserting this changes nothing about the existing branches.
        // Insert this immediately after the refresh_token block (or
        // wherever reads cleanest — order doesn't matter functionally).
        if (grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
            if (!device_code || !client_id) {
                return NextResponse.json(
                    {
                        error: "invalid_request",
                        error_description:
                            "Missing required parameters: device_code, client_id",
                    },
                    { status: 400 },
                );
            }

            // Same IP/user-agent extraction as
            // app/api/auth/mfa/challenge/verify/route.ts, used for the
            // device.poll_abuse / device.exchange_success audit events
            // below. Scoped to this block only — authorization_code and
            // refresh_token above are untouched.
            const ipAddress =
                request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
                request.headers.get("cf-connecting-ip") ||
                "unknown";
            const userAgent = request.headers.get("user-agent") || "unknown";

            const db = await getDatabase();

            try {
                // Public clients never send a client_secret — deliberately
                // NOT using getOAuthClientByIdWithSecret (its "WithSecret"
                // name is misleading; it's a SELECT * that happens to
                // include client_type, but calling it here would suggest
                // secret validation is relevant when it isn't). Also not
                // getOAuthClientById — its column list predates
                // client_type and doesn't select it, which would silently
                // produce client.client_type === undefined here. Instead:
                // the exact inline query createDeviceAuthorization already
                // uses in device-auth-service.ts, copied verbatim so
                // there's exactly one place in the codebase that defines
                // "what counts as an eligible device-flow client."
                const client = (await db
                    .prepare(
                        "SELECT client_id, client_type, is_active, scopes FROM oauth_clients WHERE client_id = ?",
                    )
                    .bind(client_id)
                    .first()) as {
                    client_id: string;
                    client_type: string;
                    is_active: number;
                    scopes: string;
                } | null;

                if (
                    client?.is_active !== 1 ||
                    client.client_type !== "public"
                ) {
                    return NextResponse.json(
                        {
                            error: "invalid_client",
                            error_description: "Unknown or ineligible client",
                        },
                        { status: 401 },
                    );
                }

                const deviceCodeHash = await hashString(device_code);
                const row = (await db
                    .prepare(
                        "SELECT * FROM device_authorizations WHERE device_code_hash = ?",
                    )
                    .bind(deviceCodeHash)
                    .first()) as {
                    id: string;
                    client_id: string;
                    scopes: string;
                    status: string;
                    user_id: string | null;
                    interval_seconds: number;
                    last_polled_at: string | null;
                    poll_count: number;
                    expires_at: string;
                    exchanged_at: string | null;
                    audience: string | null;
                } | null;

                if (!row) {
                    // Covers unknown codes and (once purged by the expiry
                    // cleanup cron) old exchanged/expired ones alike —
                    // replay looks identical to "never existed" to a
                    // poller, which is the correct RFC 8628 behavior.
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description:
                                "Unknown or already-used device_code",
                        },
                        { status: 400 },
                    );
                }

                // Pure decision — see classifyDevicePollAttempt in
                // device-auth-service.ts for the branching logic itself
                // and its vitest coverage. This block below only performs
                // the DB write (if any) and HTTP response each outcome
                // implies.
                const classification = classifyDevicePollAttempt(
                    row,
                    client_id,
                );

                switch (classification.kind) {
                    case "client_mismatch":
                        // A different client_id presenting a valid
                        // device_code must fail closed.
                        return NextResponse.json(
                            {
                                error: "invalid_grant",
                                error_description:
                                    "client_id does not match this device_code",
                            },
                            { status: 400 },
                        );

                    case "access_denied":
                        return NextResponse.json(
                            {
                                error: "access_denied",
                                error_description:
                                    "The user denied this request",
                            },
                            { status: 400 },
                        );

                    case "expired_token": {
                        if (classification.wasPending) {
                            await db
                                .prepare(
                                    "UPDATE device_authorizations SET status = 'expired' WHERE id = ? AND status = 'pending'",
                                )
                                .bind(row.id)
                                .run();
                        }
                        return NextResponse.json(
                            {
                                error: "expired_token",
                                error_description:
                                    "The device code has expired",
                            },
                            { status: 400 },
                        );
                    }

                    case "slow_down": {
                        // RFC 8628 §3.5 pacing. last_polled_at/poll_count
                        // exist in the #79 schema but were never written
                        // to before this PR — this is the first code path
                        // that populates them.
                        await db
                            .prepare(
                                "UPDATE device_authorizations SET last_polled_at = CURRENT_TIMESTAMP, interval_seconds = ?, poll_count = poll_count + 1 WHERE id = ?",
                            )
                            .bind(classification.newIntervalSeconds, row.id)
                            .run();

                        // Audit trail (accounts.elixpo#80): only log once
                        // a device_code first crosses the poll-violation
                        // threshold, not on every single slow_down, so a
                        // merely-eager CLI does not spam the audit log.
                        if (row.poll_count + 1 === 5) {
                            await logAuditEvent(db, {
                                id: generateUUID(),
                                userId: row.user_id ?? undefined,
                                eventType: "device.poll_abuse",
                                provider: client_id,
                                ipAddress,
                                userAgent,
                                status: "failure",
                            }).catch(() => {});
                        }

                        return NextResponse.json(
                            {
                                error: "slow_down",
                                error_description: "Polling too frequently",
                            },
                            { status: 400 },
                        );
                    }

                    case "authorization_pending":
                        await db
                            .prepare(
                                "UPDATE device_authorizations SET last_polled_at = CURRENT_TIMESTAMP, poll_count = poll_count + 1 WHERE id = ?",
                            )
                            .bind(row.id)
                            .run();
                        return NextResponse.json(
                            {
                                error: "authorization_pending",
                                error_description:
                                    "The user has not yet approved this request",
                            },
                            { status: 400 },
                        );

                    case "not_exchangeable":
                        return NextResponse.json(
                            {
                                error: "invalid_grant",
                                error_description:
                                    "This device_code cannot be exchanged",
                            },
                            { status: 400 },
                        );

                    case "ready_to_exchange":
                        break; // fall through to the exchange below
                }

                if (classification.kind !== "ready_to_exchange") {
                    // Unreachable given the switch above; satisfies
                    // TypeScript's narrowing without a fallthrough bug.
                    return NextResponse.json(
                        {
                            error: "server_error",
                            error_description: "Unexpected state",
                        },
                        { status: 500 },
                    );
                }

                // Atomic single-use exchange claim (migration 0020,
                // exchanged_at) — same UPDATE...WHERE + changes-count
                // pattern as cleanupExpiredDeviceAuthorizations. Only one
                // concurrent poller can ever win this. This is the one
                // piece of the whole grant that classifyDevicePollAttempt
                // deliberately can't decide as a pure function — the race
                // outcome only exists once you actually run the UPDATE.
                const claim = await db
                    .prepare(
                        "UPDATE device_authorizations SET exchanged_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'approved' AND exchanged_at IS NULL AND expires_at > CURRENT_TIMESTAMP",
                    )
                    .bind(row.id)
                    .run();

                if (claim.meta.changes !== 1) {
                    // Lost the race to a concurrent poll, or this
                    // device_code was already redeemed once before —
                    // either way, replay.
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description:
                                "This device_code has already been used",
                        },
                        { status: 400 },
                    );
                }

                // Audit trail (accounts.elixpo#80) for a successful
                // device_code exchange, fire-and-forget, same shape as
                // mfa.challenge_passed.
                await logAuditEvent(db, {
                    id: generateUUID(),
                    userId: row.user_id as string,
                    eventType: "device.exchange_success",
                    provider: client_id,
                    ipAddress,
                    userAgent,
                    status: "success",
                }).catch(() => {});

                // Token issuance mirrors the authorization_code block's
                // createAccessToken/createRefreshToken/storeRefreshToken
                // calls (confirmed verbatim), with one deliberate
                // divergence — see the `provider` comment below.
                const user = (await getUserById(
                    db,
                    row.user_id as string,
                )) as any;
                if (!user) {
                    return NextResponse.json(
                        {
                            error: "invalid_grant",
                            error_description: "User not found",
                        },
                        { status: 400 },
                    );
                }

                // MAU counter — fire-and-forget, same as
                // authorization_code's block. Deliberately included for
                // parity: without this, device-flow (CLI) sign-ins would
                // silently not count toward MAU metrics, which looks like
                // a real gap rather than a stylistic difference. Easy to
                // remove in review if device-flow logins should be
                // excluded from this metric for some reason not visible
                // from the token endpoint alone.
                try {
                    const { recordMauHit } = await import("@/lib/mau");
                    await recordMauHit(db, client_id, row.user_id as string);
                } catch {
                    /* best-effort */
                }

                const scopes = row.scopes.split(" ").filter(Boolean);
                const sessionId = generateUUID();
                const oauthClaims = {
                    clientId: client_id,
                    audience: row.audience || undefined,
                    sid: sessionId,
                };

                // DELIBERATE DIVERGENCE from authorization_code, flagged
                // for review rather than silently either copied or fixed:
                //
                // authorization_code hardcodes the literal string "email"
                // as the provider claim for every token it issues,
                // regardless of how the user actually authenticated
                // (google/github/discord/microsoft/email are all real
                // values per JWTPayload's type) — looks like a
                // pre-existing simplification/bug, out of scope for this
                // PR to fix in that block.
                //
                // Rather than propagate that into a brand-new code path,
                // this looks up the user's real provider from `identities`
                // — same query app/api/auth/accounts/route.ts already
                // uses. That route's fallback chain is
                // `payload.provider || identity?.provider || "email"`;
                // device flow has no JWT payload to start from (we're
                // working from device_authorizations.user_id, not a
                // decoded token), so the first link of that chain doesn't
                // apply here — this uses the remaining two links,
                // `identity?.provider || "email"`.
                const identity = (await db
                    .prepare(
                        "SELECT provider FROM identities WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
                    )
                    .bind(row.user_id)
                    .first()) as { provider: string } | null;
                const provider = (identity?.provider || "email") as
                    | "google"
                    | "github"
                    | "discord"
                    | "microsoft"
                    | "email";

                const accessToken = await createAccessToken(
                    row.user_id as string,
                    user.email,
                    provider,
                    parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10),
                    scopes,
                    oauthClaims,
                );

                const refreshToken = await createRefreshToken(
                    row.user_id as string,
                    provider,
                    parseInt(
                        process.env.REFRESH_TOKEN_EXPIRATION_DAYS || "30",
                        10,
                    ),
                    scopes,
                    oauthClaims,
                );
                const refreshTokenHash = await hashString(refreshToken);
                const idToken = scopes.includes("openid")
                    ? await createIdToken(
                          row.user_id as string,
                          user.email,
                          client_id,
                          parseInt(
                              process.env.JWT_EXPIRATION_MINUTES || "15",
                              10,
                          ),
                          {
                              emailVerified: !!user.email_verified,
                              name: user.display_name,
                              preferredUsername: user.username,
                          },
                      )
                    : undefined;

                await storeRefreshToken(db, {
                    id: generateUUID(),
                    userId: row.user_id as string,
                    tokenHash: refreshTokenHash,
                    clientId: client_id,
                    expiresAt: new Date(
                        Date.now() +
                            parseInt(
                                process.env.REFRESH_TOKEN_EXPIRATION_DAYS ||
                                    "30",
                                10,
                            ) *
                                86_400_000,
                    ),
                    familyId: sessionId,
                    sid: sessionId,
                });

                return NextResponse.json(
                    {
                        access_token: accessToken,
                        refresh_token: refreshToken,
                        token_type: "Bearer",
                        expires_in:
                            parseInt(
                                process.env.JWT_EXPIRATION_MINUTES || "15",
                                10,
                            ) * 60,
                        scope: scopes.join(" "),
                        ...(idToken ? { id_token: idToken } : {}),
                    },
                    { status: 200 },
                );
            } catch (error) {
                console.error("[Token] Device code flow error:", error);
                return NextResponse.json(
                    {
                        error: "server_error",
                        error_description: "Failed to exchange device code",
                    },
                    { status: 500 },
                );
            }
        }

        // NOTE: intentionally no DatabaseRateLimiter here — confirmed via
        // `grep -n "RateLimit|rate-limit|rate_limit" app/api/auth/token/route.ts`
        // that authorization_code and refresh_token above are also
        // unprotected at the route level. Matching that (not "fixing" it)
        // per the #80 PR discussion; route-level rate limiting for the
        // whole token endpoint is a separate concern from this PR.

        return NextResponse.json(
            {
                error: "unsupported_grant_type",
                error_description: `grant_type '${grant_type}' is not supported`,
            },
            { status: 400 },
        );
    } catch (error) {
        console.error("[Token Endpoint] Error:", error);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: "Failed to process token request",
            },
            { status: 500 },
        );
    }
}
