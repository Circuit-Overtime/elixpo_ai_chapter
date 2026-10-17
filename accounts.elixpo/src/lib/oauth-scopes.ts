export const OAUTH_SCOPE_DETAILS = {
    openid: {
        label: "Identity",
        description: "Confirm your unique Elixpo account ID.",
    },
    profile: {
        label: "Basic profile",
        description: "View your display name, username, and profile picture.",
    },
    email: {
        label: "Email address",
        description: "View your email address and whether it is verified.",
    },
} as const;

export type OAuthScope = keyof typeof OAUTH_SCOPE_DETAILS;
export const SUPPORTED_OAUTH_SCOPES = Object.keys(
    OAUTH_SCOPE_DETAILS,
) as OAuthScope[];

export function parseOAuthScopes(value: string): string[] {
    return [...new Set(value.split(/\s+/).filter(Boolean))];
}

export function unsupportedOAuthScopes(scopes: string[]): string[] {
    return scopes.filter(
        (scope) => !SUPPORTED_OAUTH_SCOPES.includes(scope as OAuthScope),
    );
}
