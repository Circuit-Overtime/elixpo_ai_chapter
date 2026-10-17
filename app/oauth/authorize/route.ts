export const runtime = "edge";

import { type NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/d1-client";
import { createAuthRequest, getOAuthClientById, getUserById } from "@/lib/db";
import { verifyJWT } from "@/lib/jwt";
import { findScopeOption, parseCustomScopes } from "@/lib/oauth-scope-registry";
import { parseOAuthScopes } from "@/lib/oauth-scopes";
import { isValidPkceValue } from "@/lib/pkce";
import { generateRandomString, generateUUID } from "@/lib/webcrypto";

/**
 * GET /oauth/authorize
 *
 * Standard OAuth 2.0 Authorization Endpoint (RFC 6749 §4.1.1)
 *
 * External apps redirect their users here with:
 *   ?response_type=code
 *   &client_id=<registered_client_id>
 *   &redirect_uri=<whitelisted_uri>
 *   &state=<csrf_state>
 *   &scope=openid profile email   (optional)
 *
 * What this does:
 *   1. Validates the request parameters and the registered client
 *   2. If the user is not logged in → saves the request in a cookie and
 *      redirects them to /login?next=/oauth/authorize?... so they can
 *      authenticate first, then come back here
 *   3. If the user is logged in → stores the auth request in the DB and
 *      redirects to the /authorize consent screen
 */
export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const responseType = sp.get("response_type");
    const clientId = sp.get("client_id");
    const redirectUri = sp.get("redirect_uri");
    const state = sp.get("state");
    const scope = sp.get("scope") || "openid profile email";
    const nonce = sp.get("nonce") || "";
    const codeChallenge = sp.get("code_challenge");
    const codeChallengeMethod = sp.get("code_challenge_method");

    // --- 1. Validate required params ---
    if (!responseType || !clientId || !redirectUri || !state) {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description:
                    "Missing required parameters: response_type, client_id, redirect_uri, state",
            },
            { status: 400 },
        );
    }

    if (responseType !== "code") {
        return NextResponse.json(
            {
                error: "unsupported_response_type",
                error_description: "Only response_type=code is supported",
            },
            { status: 400 },
        );
    }

    // Validate redirect_uri is a well-formed URL (HTTP and HTTPS allowed)
    let parsedRedirect: URL;
    try {
        parsedRedirect = new URL(redirectUri);
        if (
            parsedRedirect.protocol !== "https:" &&
            parsedRedirect.protocol !== "http:"
        ) {
            throw new Error("HTTP or HTTPS required");
        }
    } catch {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description:
                    "redirect_uri must be a valid absolute URL using HTTP or HTTPS",
            },
            { status: 400 },
        );
    }

    // --- 2. Validate client ---
    try {
        const db = await getDatabase();
        const client = (await getOAuthClientById(db, clientId)) as any;

        if (!client) {
            return NextResponse.json(
                {
                    error: "invalid_client",
                    error_description: "Client not found",
                },
                { status: 401 },
            );
        }

        if (!client.is_active) {
            return NextResponse.json(
                {
                    error: "invalid_client",
                    error_description: "Client is not active",
                },
                { status: 401 },
            );
        }

        if (
            (client.client_type === "public" && !codeChallenge) ||
            (!codeChallenge && !!codeChallengeMethod) ||
            (codeChallenge &&
                (codeChallengeMethod !== "S256" ||
                    !isValidPkceValue(codeChallenge)))
        ) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description:
                        "Use a valid S256 PKCE code_challenge; public clients require PKCE",
                },
                { status: 400 },
            );
        }

        const allowedUris: string[] = JSON.parse(client.redirect_uris || "[]");
        if (!allowedUris.includes(redirectUri)) {
            return NextResponse.json(
                {
                    error: "invalid_request",
                    error_description:
                        "redirect_uri is not registered for this client",
                },
                { status: 400 },
            );
        }

        const requestedScopes = parseOAuthScopes(scope);
        const registeredScopes: string[] = JSON.parse(client.scopes || "[]");
        const customScopes = parseCustomScopes(client.custom_scopes);
        const invalidScopes = requestedScopes.filter(
            (requestedScope) =>
                !findScopeOption(requestedScope, customScopes) ||
                !registeredScopes.includes(requestedScope),
        );
        if (invalidScopes.length > 0) {
            parsedRedirect.searchParams.set("error", "invalid_scope");
            parsedRedirect.searchParams.set(
                "error_description",
                `Unsupported or unregistered scopes: ${[
                    ...new Set(invalidScopes),
                ].join(", ")}`,
            );
            parsedRedirect.searchParams.set("state", state);
            return NextResponse.redirect(parsedRedirect);
        }

        // --- 3. Check if user is authenticated ---
        const accessToken =
            request.cookies.get("access_token")?.value ||
            request.headers.get("authorization")?.replace("Bearer ", "");
        const refreshTokenCookie = request.cookies.get("refresh_token")?.value;

        // Build the "send them to /login and resume here afterwards"
        // redirect once — used as a fallback on auth failure below.
        const buildLoginRedirect = () => {
            const pendingParams = new URLSearchParams({
                response_type: responseType,
                client_id: clientId,
                redirect_uri: redirectUri,
                state,
                scope,
                ...(nonce ? { nonce } : {}),
                ...(codeChallenge
                    ? {
                          code_challenge: codeChallenge,
                          code_challenge_method: "S256",
                      }
                    : {}),
            });
            const loginUrl = new URL("/login", request.url);
            loginUrl.searchParams.set(
                "next",
                `/oauth/authorize?${pendingParams.toString()}`,
            );
            return NextResponse.redirect(loginUrl);
        };

        // Verify the access token if present. If it's missing OR expired,
        // try the server-side auto-refresh path before sending the buyer
        // to /login — many users hit this route with an expired access
        // cookie but a valid refresh cookie sitting beside it; making
        // them visit /login (which would just auto-refresh anyway) is a
        // pointless spinner flash.
        let payload = accessToken ? await verifyJWT(accessToken) : null;
        let rotatedTokens: Awaited<
            ReturnType<typeof import("@/lib/auth-refresh").tryRefreshSession>
        > | null = null;
        if (payload?.type !== "access") {
            if (refreshTokenCookie) {
                const { tryRefreshSession } = await import(
                    "@/lib/auth-refresh"
                );
                const refreshed = await tryRefreshSession(
                    request,
                    refreshTokenCookie,
                );
                if (refreshed.ok) {
                    rotatedTokens = refreshed;
                    // Re-verify the newly-minted token so the rest of
                    // this handler sees the canonical JWTPayload shape.
                    payload = await verifyJWT(refreshed.newAccessToken);
                }
            }
            if (payload?.type !== "access") {
                // Refresh either wasn't possible or failed — fall back
                // to /login. The login page's existing auto-redirect
                // handles the rare race where cookies arrive between
                // the two checks.
                return buildLoginRedirect();
            }
        }

        // --- 3b. Require a username before issuing any SSO token ---
        // Consumers (e.g. blogs.elixpo) rely on the handle; never hand one out
        // for a handle-less account. Send them to /setup-name and resume here.
        const ssoUser = (await getUserById(db, payload.sub)) as {
            username?: string;
        } | null;
        if (!ssoUser?.username) {
            const pendingParams = new URLSearchParams({
                response_type: responseType,
                client_id: clientId,
                redirect_uri: redirectUri,
                state,
                scope,
                ...(nonce ? { nonce } : {}),
                ...(codeChallenge
                    ? {
                          code_challenge: codeChallenge,
                          code_challenge_method: "S256",
                      }
                    : {}),
            });
            const setupUrl = new URL("/setup-name", request.url);
            setupUrl.searchParams.set(
                "next",
                `/oauth/authorize?${pendingParams.toString()}`,
            );
            return NextResponse.redirect(setupUrl);
        }

        // --- 4. Store the auth request in DB ---
        await createAuthRequest(db, {
            id: generateUUID(),
            state,
            nonce,
            pkceVerifier: generateRandomString(128),
            codeChallenge,
            codeChallengeMethod: codeChallenge ? "S256" : null,
            provider: "sso",
            clientId,
            redirectUri,
            scopes: scope,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
        });

        // --- 5. Redirect to the consent screen ---
        const consentUrl = new URL("/authorize", request.url);
        consentUrl.searchParams.set("client_id", clientId);
        consentUrl.searchParams.set("redirect_uri", redirectUri);
        consentUrl.searchParams.set("state", state);
        consentUrl.searchParams.set("scope", scope);
        if (nonce) consentUrl.searchParams.set("nonce", nonce);

        const consentResponse = NextResponse.redirect(consentUrl);
        // If we rotated tokens during the auth check above, attach the
        // refreshed cookies to this redirect so the consent screen — and
        // any subsequent /api/auth/* call — sees the valid session
        // immediately. Without this, the buyer would arrive at /authorize
        // with the same expired access cookie and another auto-refresh
        // would have to fire.
        if (rotatedTokens?.ok) {
            const { applyRefreshedCookies } = await import(
                "@/lib/auth-refresh"
            );
            await applyRefreshedCookies(
                consentResponse,
                rotatedTokens,
                request,
            );
        }
        return consentResponse;
    } catch (err) {
        console.error("[OAuth Authorize] Error:", err);
        return NextResponse.json(
            {
                error: "server_error",
                error_description: "Failed to process authorization request",
            },
            { status: 500 },
        );
    }
}
