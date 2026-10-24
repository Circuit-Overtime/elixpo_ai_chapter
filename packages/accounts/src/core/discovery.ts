import { AccountsError } from "./errors.js";
import type { AuthorizationServerMetadata } from "./types.js";

const REQUIRED_ENDPOINTS = [
    "authorization_endpoint",
    "token_endpoint",
    "userinfo_endpoint",
    "jwks_uri",
    "revocation_endpoint",
] as const;

export function normalizeIssuer(issuer: string): string {
    let parsed: URL;
    try {
        parsed = new URL(issuer);
    } catch {
        throw new AccountsError(
            "configuration_error",
            "Accounts issuer must be an absolute URL",
        );
    }
    const isLocalhost =
        parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (
        parsed.protocol !== "https:" &&
        !(isLocalhost && parsed.protocol === "http:")
    ) {
        throw new AccountsError(
            "configuration_error",
            "Accounts issuer must use HTTPS outside localhost",
        );
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new AccountsError(
            "configuration_error",
            "Accounts issuer cannot contain credentials, query, or fragment",
        );
    }
    return parsed.toString().replace(/\/$/, "");
}

function isStringArray(value: unknown): value is string[] {
    return (
        Array.isArray(value) && value.every((item) => typeof item === "string")
    );
}

function validateMetadata(
    value: unknown,
    expectedIssuer: string,
): AuthorizationServerMetadata {
    if (!value || typeof value !== "object") {
        throw new AccountsError(
            "discovery_error",
            "Discovery response is not an object",
        );
    }
    const metadata = value as Record<string, unknown>;
    if (metadata.issuer !== expectedIssuer) {
        throw new AccountsError(
            "discovery_error",
            "Discovery issuer did not match configuration",
        );
    }
    const issuerOrigin = new URL(expectedIssuer).origin;
    for (const field of REQUIRED_ENDPOINTS) {
        const endpoint = metadata[field];
        if (typeof endpoint !== "string") {
            throw new AccountsError(
                "discovery_error",
                `Discovery metadata is missing ${field}`,
            );
        }
        let parsed: URL;
        try {
            parsed = new URL(endpoint);
        } catch {
            throw new AccountsError(
                "discovery_error",
                `Discovery metadata contains an invalid ${field}`,
            );
        }
        if (parsed.origin !== issuerOrigin) {
            throw new AccountsError(
                "discovery_error",
                `Discovery ${field} must use the issuer origin`,
            );
        }
    }
    for (const field of [
        "scopes_supported",
        "grant_types_supported",
        "response_types_supported",
        "token_endpoint_auth_methods_supported",
        "code_challenge_methods_supported",
    ]) {
        if (!isStringArray(metadata[field])) {
            throw new AccountsError(
                "discovery_error",
                `Discovery metadata contains an invalid ${field}`,
            );
        }
    }
    if (
        !(metadata.code_challenge_methods_supported as string[]).includes(
            "S256",
        )
    ) {
        throw new AccountsError(
            "discovery_error",
            "Authorization server does not support S256 PKCE",
        );
    }
    return metadata as unknown as AuthorizationServerMetadata;
}

export async function discoverAccounts(options: {
    issuer: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}): Promise<AuthorizationServerMetadata> {
    const issuer = normalizeIssuer(options.issuer);
    const fetcher = options.fetch ?? globalThis.fetch;
    if (!fetcher) {
        throw new AccountsError(
            "configuration_error",
            "No fetch implementation is available",
        );
    }
    const timeoutMs = options.timeoutMs ?? 5_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetcher(
            `${issuer}/.well-known/oauth-authorization-server`,
            {
                headers: { Accept: "application/json" },
                cache: "no-store",
                redirect: "error",
                signal: controller.signal,
            },
        );
        if (!response.ok) {
            throw new AccountsError(
                "discovery_error",
                "Accounts discovery request failed",
                {
                    status: response.status,
                    retryable: response.status >= 500,
                },
            );
        }
        if (new URL(response.url || issuer).origin !== new URL(issuer).origin) {
            throw new AccountsError(
                "discovery_error",
                "Accounts discovery changed origin",
            );
        }
        return validateMetadata(await response.json(), issuer);
    } catch (error) {
        if (error instanceof AccountsError) throw error;
        throw new AccountsError(
            "network_error",
            "Accounts discovery was unavailable",
            {
                retryable: true,
                cause: error,
            },
        );
    } finally {
        clearTimeout(timeout);
    }
}
