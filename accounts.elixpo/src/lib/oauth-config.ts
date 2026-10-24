import type { D1Database } from "@cloudflare/workers-types";

export const LIXRL_SCOPE_DETAILS = {
    "lixrl:keys:create": {
        label: "Create one scoped Lixrl API key",
        description:
            "Approve creation of one scoped Lixrl API key. This does not grant direct access to your links.",
        highImpact: true,
    },
} as const;

export interface OAuthProvider {
    name: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    userInfoEndpoint: string;
    scopes: string[];
}

export interface OAuthClient {
    clientId: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
    createdAt: string;
    isActive: boolean;
}

export function getOAuthConfig(
    provider: string,
    env: {
        GOOGLE_CLIENT_ID?: string;
        GOOGLE_CLIENT_SECRET?: string;
        GITHUB_CLIENT_ID?: string;
        GITHUB_CLIENT_SECRET?: string;
        DISCORD_CLIENT_ID?: string;
        DISCORD_CLIENT_SECRET?: string;
        MICROSOFT_CLIENT_ID?: string;
        MICROSOFT_CLIENT_SECRET?: string;
    },
    /** Pass the request origin (e.g. https://accounts.elixpo.com) so the
     *  redirect_uri is always correct regardless of build-time env vars. */
    requestOrigin?: string,
): OAuthProvider | null {
    const baseUrl = requestOrigin || process.env.NEXT_PUBLIC_APP_URL || "";

    switch (provider.toLowerCase()) {
        case "google":
            return {
                name: "google",
                clientId: env.GOOGLE_CLIENT_ID || "",
                clientSecret: env.GOOGLE_CLIENT_SECRET || "",
                redirectUri: `${baseUrl}/api/auth/callback/google`,
                authorizationEndpoint:
                    "https://accounts.google.com/o/oauth2/v2/auth",
                tokenEndpoint: "https://oauth2.googleapis.com/token",
                userInfoEndpoint:
                    "https://openidconnect.googleapis.com/v1/userinfo",
                scopes: ["openid", "profile", "email"],
            };

        case "github":
            return {
                name: "github",
                clientId: env.GITHUB_CLIENT_ID || "",
                clientSecret: env.GITHUB_CLIENT_SECRET || "",
                redirectUri: `${baseUrl}/api/auth/callback/github`,
                authorizationEndpoint:
                    "https://github.com/login/oauth/authorize",
                tokenEndpoint: "https://github.com/login/oauth/access_token",
                userInfoEndpoint: "https://api.github.com/user",
                scopes: ["read:user", "user:email"],
            };

        case "microsoft":
            return {
                name: "microsoft",
                clientId: env.MICROSOFT_CLIENT_ID || "",
                clientSecret: env.MICROSOFT_CLIENT_SECRET || "",
                redirectUri: `${baseUrl}/api/auth/callback/microsoft`,
                // `common` tenant — accepts both work/school AAD accounts
                // and personal MSAs (outlook.com/xbox/etc.). Switch to a
                // specific GUID/domain if/when we go single-tenant for
                // enterprise plans.
                authorizationEndpoint:
                    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
                tokenEndpoint:
                    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                // OIDC userinfo on Graph returns sub/name/email/picture in
                // standard shape — no separate /me call needed for the
                // basics. Picture comes back as a Graph URL that requires
                // an auth header to fetch the binary; we don't store it.
                userInfoEndpoint: "https://graph.microsoft.com/oidc/userinfo",
                scopes: ["openid", "profile", "email"],
            };

        case "discord":
            return {
                name: "discord",
                clientId: env.DISCORD_CLIENT_ID || "",
                clientSecret: env.DISCORD_CLIENT_SECRET || "",
                redirectUri: `${baseUrl}/api/auth/callback/discord`,
                authorizationEndpoint: "https://discord.com/oauth2/authorize",
                tokenEndpoint: "https://discord.com/api/oauth2/token",
                userInfoEndpoint: "https://discord.com/api/users/@me",
                // `identify` gives id/username/global_name/avatar; `email`
                // gives verified email. We require both — same contract as
                // Google + GitHub: a verified email is mandatory for account
                // creation.
                scopes: ["identify", "email"],
            };

        default:
            return null;
    }
}

export async function getOAuthClientFromDB(
    db: D1Database,
    clientId: string,
): Promise<OAuthClient | null> {
    try {
        const stmt = db.prepare(
            "SELECT client_id, name, redirect_uris, scopes, created_at, is_active FROM oauth_clients WHERE client_id = ? AND is_active = 1",
        );
        const result = (await stmt.bind(clientId).first()) as any;

        if (!result) {
            return null;
        }

        return {
            clientId: result.client_id,
            name: result.name,
            redirectUris: JSON.parse(result.redirect_uris || "[]"),
            scopes: JSON.parse(result.scopes || "[]"),
            createdAt: result.created_at,
            isActive: result.is_active === 1,
        };
    } catch (error) {
        console.error("[OAuth] Error fetching client from DB:", error);
        return null;
    }
}

export async function validateOAuthClientCredentials(
    db: D1Database,
    clientId: string,
    clientSecretHash: string,
): Promise<boolean> {
    try {
        const stmt = db.prepare(
            "SELECT 1 FROM oauth_clients WHERE client_id = ? AND client_secret_hash = ? AND is_active = 1",
        );
        const result = await stmt.bind(clientId, clientSecretHash).first();
        return !!result;
    } catch (error) {
        console.error("[OAuth] Error validating client credentials:", error);
        return false;
    }
}
