import {
    assertState,
    generateNonce,
    generatePkce,
    generateState,
} from "./crypto.js";
import { AccountsError } from "./errors.js";
import type {
    AccountsConfiguration,
    AuthorizationServerMetadata,
    AuthorizationTransaction,
} from "./types.js";

function validateRedirectUri(value: string): string {
    let redirect: URL;
    try {
        redirect = new URL(value);
    } catch {
        throw new AccountsError(
            "configuration_error",
            "redirectUri must be an absolute URL",
        );
    }
    const local =
        redirect.hostname === "localhost" || redirect.hostname === "127.0.0.1";
    if (
        redirect.protocol !== "https:" &&
        !(local && redirect.protocol === "http:")
    ) {
        throw new AccountsError(
            "configuration_error",
            "redirectUri must use HTTPS outside localhost",
        );
    }
    if (redirect.username || redirect.password || redirect.hash) {
        throw new AccountsError(
            "configuration_error",
            "redirectUri cannot contain credentials or a fragment",
        );
    }
    return redirect.toString();
}

export function parseAuthorizationCallback(
    callbackUrl: string | URL,
    expectedState: string,
): { code: string } {
    const url = callbackUrl instanceof URL ? callbackUrl : new URL(callbackUrl);
    const returnedState = url.searchParams.get("state") || "";
    assertState(expectedState, returnedState);
    const error = url.searchParams.get("error");
    if (error) {
        throw new AccountsError(
            "oauth_error",
            "Authorization request was rejected",
            {
                oauthCode: error as import("./types.js").OAuthErrorCode,
            },
        );
    }
    const code = url.searchParams.get("code");
    if (!code) {
        throw new AccountsError(
            "protocol_error",
            "Authorization callback did not include a code",
        );
    }
    return { code };
}

function validateScopes(scopes: string[]): string[] {
    const normalized = [
        ...new Set(scopes.map((scope) => scope.trim()).filter(Boolean)),
    ];
    if (
        normalized.length === 0 ||
        normalized.some((scope) => /\s/.test(scope))
    ) {
        throw new AccountsError(
            "configuration_error",
            "At least one valid OAuth scope is required",
        );
    }
    return normalized;
}

export async function createAuthorizationRequest(
    metadata: AuthorizationServerMetadata,
    configuration: Pick<
        AccountsConfiguration,
        "clientId" | "redirectUri" | "audience"
    >,
    options: {
        scopes?: string[];
        prompt?: "consent" | "login" | "select_account";
    } = {},
): Promise<{ url: URL; transaction: AuthorizationTransaction }> {
    if (!configuration.clientId.trim()) {
        throw new AccountsError("configuration_error", "clientId is required");
    }
    const scopes = validateScopes(
        options.scopes ?? ["openid", "profile", "email"],
    );
    const [{ codeVerifier, codeChallenge }, state, nonce] = await Promise.all([
        generatePkce(),
        Promise.resolve(generateState()),
        Promise.resolve(generateNonce()),
    ]);
    const url = new URL(metadata.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", configuration.clientId);
    url.searchParams.set(
        "redirect_uri",
        validateRedirectUri(configuration.redirectUri),
    );
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (configuration.audience)
        url.searchParams.set("audience", configuration.audience);
    if (options.prompt) url.searchParams.set("prompt", options.prompt);

    return {
        url,
        transaction: { state, nonce, codeVerifier, createdAt: Date.now() },
    };
}
