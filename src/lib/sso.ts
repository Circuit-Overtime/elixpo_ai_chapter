/**
 * Elixpo Accounts SSO client. mail.elixpo is an OAuth 2.0 client of
 * accounts.elixpo (authorization-code flow). See accounts.elixpo /docs/quickstart.
 */

import { getEnv, requireEnv } from "./env";

export async function accountsBaseUrl(): Promise<string> {
    return ((await getEnv("NEXT_PUBLIC_ACCOUNTS_URL")) || "https://accounts.elixpo.com").replace(
        /\/$/,
        "",
    );
}

export async function buildAuthorizeUrl(state: string, redirectUri: string): Promise<string> {
    const base = await accountsBaseUrl();
    const clientId = await requireEnv("NEXT_PUBLIC_ELIXPO_CLIENT_ID");
    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope: "openid profile email",
    });
    return `${base}/oauth/authorize?${params.toString()}`;
}

export interface AccountsUser {
    id: string;
    userId: string;
    email: string;
    username?: string | null;
    displayName?: string | null;
    avatar?: string | null;
}

export async function exchangeCodeForUser(
    code: string,
    redirectUri: string,
): Promise<AccountsUser> {
    const base = await accountsBaseUrl();
    const clientId = await requireEnv("NEXT_PUBLIC_ELIXPO_CLIENT_ID");
    const clientSecret = await requireEnv("ELIXPO_CLIENT_SECRET");

    const tokenRes = await fetch(`${base}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
        }),
    });
    const tokens: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokens.access_token) {
        throw new Error(
            `token exchange failed: ${tokens.error_description || tokens.error || tokenRes.status}`,
        );
    }

    const meRes = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me: any = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !(me.id || me.userId)) {
        throw new Error(`profile fetch failed: ${me.error || meRes.status}`);
    }

    return {
        id: me.id || me.userId,
        userId: me.userId || me.id,
        email: me.email,
        username: me.username ?? null,
        displayName: me.displayName ?? null,
        avatar: me.avatar ?? null,
    };
}
