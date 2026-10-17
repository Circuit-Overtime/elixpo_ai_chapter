import { AccountsError } from "./errors.js";
import type {
    AccountsConfiguration,
    AuthorizationServerMetadata,
    OAuthErrorCode,
    TokenSet,
} from "./types.js";

type RawTokenResponse = {
    access_token?: unknown;
    refresh_token?: unknown;
    id_token?: unknown;
    token_type?: unknown;
    expires_in?: unknown;
    scope?: unknown;
    error?: unknown;
};

function parseTokenSet(value: RawTokenResponse): TokenSet {
    if (
        typeof value.access_token !== "string" ||
        typeof value.refresh_token !== "string" ||
        value.token_type !== "Bearer" ||
        typeof value.expires_in !== "number" ||
        typeof value.scope !== "string"
    ) {
        throw new AccountsError(
            "protocol_error",
            "Token endpoint returned an invalid response",
        );
    }
    return {
        accessToken: value.access_token,
        refreshToken: value.refresh_token,
        ...(typeof value.id_token === "string"
            ? { idToken: value.id_token }
            : {}),
        tokenType: "Bearer",
        expiresIn: value.expires_in,
        scope: value.scope.split(/\s+/).filter(Boolean),
    };
}

async function postForm(
    endpoint: string,
    values: Record<string, string | undefined>,
    options: { fetch?: typeof fetch; timeoutMs?: number },
): Promise<Record<string, unknown>> {
    const fetcher = options.fetch ?? globalThis.fetch;
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 5_000,
    );
    try {
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(values)) {
            if (value !== undefined) body.set(key, value);
        }
        const response = await fetcher(endpoint, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
            cache: "no-store",
            redirect: "error",
            signal: controller.signal,
        });
        let payload: Record<string, unknown>;
        try {
            payload = (await response.json()) as Record<string, unknown>;
        } catch (error) {
            throw new AccountsError(
                "protocol_error",
                "OAuth endpoint returned invalid JSON",
                {
                    status: response.status,
                    cause: error,
                },
            );
        }
        if (!response.ok || typeof payload.error === "string") {
            throw new AccountsError(
                "oauth_error",
                "OAuth request was rejected",
                {
                    oauthCode:
                        typeof payload.error === "string"
                            ? (payload.error as OAuthErrorCode)
                            : "server_error",
                    retryable: response.status >= 500,
                    status: response.status,
                },
            );
        }
        return payload;
    } catch (error) {
        if (error instanceof AccountsError) throw error;
        throw new AccountsError(
            "network_error",
            "OAuth endpoint was unavailable",
            {
                retryable: true,
                cause: error,
            },
        );
    } finally {
        clearTimeout(timeout);
    }
}

export async function exchangeAuthorizationCode(
    metadata: AuthorizationServerMetadata,
    configuration: AccountsConfiguration,
    input: { code: string; codeVerifier: string },
): Promise<TokenSet> {
    return parseTokenSet(
        await postForm(
            metadata.token_endpoint,
            {
                grant_type: "authorization_code",
                code: input.code,
                code_verifier: input.codeVerifier,
                client_id: configuration.clientId,
                client_secret: configuration.clientSecret,
                redirect_uri: configuration.redirectUri,
            },
            configuration,
        ),
    );
}

export async function refreshTokens(
    metadata: AuthorizationServerMetadata,
    configuration: AccountsConfiguration,
    refreshToken: string,
    scopes?: string[],
): Promise<TokenSet> {
    return parseTokenSet(
        await postForm(
            metadata.token_endpoint,
            {
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: configuration.clientId,
                client_secret: configuration.clientSecret,
                scope: scopes?.join(" "),
            },
            configuration,
        ),
    );
}

export async function revokeToken(
    metadata: AuthorizationServerMetadata,
    configuration: AccountsConfiguration,
    token: string,
    tokenTypeHint: "access_token" | "refresh_token" = "refresh_token",
): Promise<void> {
    await postForm(
        metadata.revocation_endpoint,
        {
            token,
            token_type_hint: tokenTypeHint,
            client_id: configuration.clientId,
            client_secret: configuration.clientSecret,
        },
        configuration,
    );
}
