/**
 * Elixpo Accounts SSO — OAuth 2.0 authorization-code client.
 *
 * Flow: buildAuthorizeUrl -> (user approves on accounts.elixpo) -> callback with
 * code -> exchangeCode -> tokens -> fetchMe (read `isAdmin`). refresh() rotates
 * the access token. We never verify the JWT ourselves — `/api/auth/me` is the
 * source of truth for identity + admin status.
 */

import { accountsUrl, redirectUri, requireEnv } from "./env";

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
}

export interface AccountsProfile {
    id?: string;
    userId?: string;
    email: string;
    username?: string;
    displayName?: string;
    isAdmin?: boolean;
    avatar?: string | null;
    emailVerified?: boolean;
    [k: string]: unknown;
}

export const OAUTH_SCOPE = "openid profile email";

/**
 * The OAuth redirect URI. Prefer an explicit value (derived from the request
 * origin by the caller) so local dev and prod each get the right callback
 * without a per-environment env var; falls back to NEXT_PUBLIC_REDIRECT_URL /
 * NEXT_PUBLIC_APP_URL.
 */
async function resolveRedirect(explicit?: string): Promise<string> {
    return explicit || (await redirectUri());
}

export async function buildAuthorizeUrl(
    state: string,
    redirect?: string,
): Promise<string> {
    const clientId = await requireEnv("ELIXPO_CLIENT_ID");
    const url = new URL(`${await accountsUrl()}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", await resolveRedirect(redirect));
    url.searchParams.set("state", state);
    url.searchParams.set("scope", OAUTH_SCOPE);
    return url.toString();
}

export async function exchangeCode(
    code: string,
    redirect?: string,
): Promise<TokenResponse> {
    const res = await fetch(`${await accountsUrl()}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            client_id: await requireEnv("ELIXPO_CLIENT_ID"),
            client_secret: await requireEnv("ELIXPO_CLIENT_SECRET"),
            redirect_uri: await resolveRedirect(redirect),
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
            `Token exchange failed (${res.status}): ${body.slice(0, 300)}`,
        );
    }
    return res.json();
}

export async function refresh(refreshToken: string): Promise<TokenResponse> {
    const res = await fetch(`${await accountsUrl()}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: await requireEnv("ELIXPO_CLIENT_ID"),
        }),
    });
    if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);
    return res.json();
}

export async function fetchMe(
    accessToken: string,
): Promise<AccountsProfile | null> {
    const res = await fetch(`${await accountsUrl()}/api/auth/me`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return res.json();
}

export async function ssoLogout(refreshToken?: string): Promise<void> {
    try {
        await fetch(`${await accountsUrl()}/api/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
                refreshToken ? { refresh_token: refreshToken } : {},
            ),
        });
    } catch {
        // best-effort
    }
}
