import {
    createLocalJWKSet,
    decodeProtectedHeader,
    type JSONWebKeySet,
    type JWTPayload,
    errors as joseErrors,
    jwtVerify,
} from "jose";
import { assertNonce } from "./crypto.js";
import { AccountsError } from "./errors.js";
import type {
    AuthorizationServerMetadata,
    VerifiedAccessToken,
    VerifiedIdToken,
} from "./types.js";

type CacheEntry = { jwks: JSONWebKeySet; expiresAt: number };
const jwksCache = new Map<string, CacheEntry>();

function audiences(payload: JWTPayload): string[] {
    if (typeof payload.aud === "string") return [payload.aud];
    if (Array.isArray(payload.aud)) return payload.aud;
    return [];
}

async function loadJwks(
    metadata: AuthorizationServerMetadata,
    options: { fetch?: typeof fetch; timeoutMs?: number },
    force = false,
): Promise<JSONWebKeySet> {
    const cached = jwksCache.get(metadata.jwks_uri);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.jwks;

    const fetcher = options.fetch ?? globalThis.fetch;
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 5_000,
    );
    try {
        const response = await fetcher(metadata.jwks_uri, {
            headers: { Accept: "application/json" },
            cache: "no-store",
            redirect: "error",
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new AccountsError(
                "token_verification_error",
                "JWKS request failed",
                {
                    status: response.status,
                    retryable: response.status >= 500,
                },
            );
        }
        const value = (await response.json()) as { keys?: unknown };
        if (!Array.isArray(value.keys) || value.keys.length === 0) {
            throw new AccountsError(
                "token_verification_error",
                "JWKS response did not contain signing keys",
            );
        }
        const valid = value.keys.every(
            (key) =>
                key &&
                typeof key === "object" &&
                (key as Record<string, unknown>).kty === "OKP" &&
                (key as Record<string, unknown>).crv === "Ed25519" &&
                (key as Record<string, unknown>).alg === "EdDSA" &&
                typeof (key as Record<string, unknown>).kid === "string" &&
                !(key as Record<string, unknown>).d,
        );
        if (!valid) {
            throw new AccountsError(
                "token_verification_error",
                "JWKS response contained an unsupported key",
            );
        }
        const jwks = value as JSONWebKeySet;
        jwksCache.set(metadata.jwks_uri, {
            jwks,
            expiresAt: Date.now() + 5 * 60_000,
        });
        return jwks;
    } catch (error) {
        if (error instanceof AccountsError) throw error;
        throw new AccountsError(
            "network_error",
            "JWKS endpoint was unavailable",
            {
                retryable: true,
                cause: error,
            },
        );
    } finally {
        clearTimeout(timeout);
    }
}

async function verify(
    token: string,
    metadata: AuthorizationServerMetadata,
    audience: string,
    options: {
        fetch?: typeof fetch;
        timeoutMs?: number;
        clockTolerance?: number;
    },
): Promise<JWTPayload> {
    let header: ReturnType<typeof decodeProtectedHeader>;
    try {
        header = decodeProtectedHeader(token);
    } catch (error) {
        throw new AccountsError(
            "token_verification_error",
            "Token header is invalid",
            { cause: error },
        );
    }
    if (header.alg !== "EdDSA" || typeof header.kid !== "string") {
        throw new AccountsError(
            "token_verification_error",
            "Token uses an unsupported signing key or algorithm",
        );
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const jwks = await loadJwks(metadata, options, attempt === 1);
            const result = await jwtVerify(token, createLocalJWKSet(jwks), {
                algorithms: ["EdDSA"],
                audience,
                issuer: metadata.issuer,
                clockTolerance: options.clockTolerance ?? 5,
            });
            return result.payload;
        } catch (error) {
            if (
                attempt === 0 &&
                error instanceof joseErrors.JWKSNoMatchingKey
            ) {
                continue;
            }
            if (error instanceof AccountsError) throw error;
            throw new AccountsError(
                "token_verification_error",
                "Token verification failed",
                { cause: error },
            );
        }
    }
    throw new AccountsError(
        "token_verification_error",
        "Token signing key was not found",
    );
}

export async function verifyAccessToken(
    token: string,
    metadata: AuthorizationServerMetadata,
    options: {
        audience: string;
        clientId?: string;
        fetch?: typeof fetch;
        timeoutMs?: number;
        clockTolerance?: number;
    },
): Promise<VerifiedAccessToken> {
    const payload = await verify(token, metadata, options.audience, options);
    if (
        payload.type !== "access" ||
        typeof payload.sub !== "string" ||
        typeof payload.iss !== "string" ||
        typeof payload.exp !== "number" ||
        typeof payload.iat !== "number" ||
        typeof payload.client_id !== "string" ||
        !Array.isArray(payload.scopes) ||
        !payload.scopes.every((scope) => typeof scope === "string") ||
        (options.clientId && payload.client_id !== options.clientId)
    ) {
        throw new AccountsError(
            "token_verification_error",
            "Access token claims are invalid",
        );
    }
    return {
        tokenType: "access",
        subject: payload.sub,
        issuer: payload.iss,
        audience: audiences(payload),
        clientId: payload.client_id,
        expiresAt: payload.exp,
        issuedAt: payload.iat,
        scopes: payload.scopes,
        ...(typeof payload.sid === "string" ? { sessionId: payload.sid } : {}),
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    };
}

export async function verifyIdToken(
    token: string,
    metadata: AuthorizationServerMetadata,
    options: {
        clientId: string;
        nonce?: string;
        fetch?: typeof fetch;
        timeoutMs?: number;
        clockTolerance?: number;
    },
): Promise<VerifiedIdToken> {
    const payload = await verify(token, metadata, options.clientId, options);
    if (
        payload.type !== "id" ||
        typeof payload.sub !== "string" ||
        typeof payload.iss !== "string" ||
        typeof payload.exp !== "number" ||
        typeof payload.iat !== "number"
    ) {
        throw new AccountsError(
            "token_verification_error",
            "ID token claims are invalid",
        );
    }
    if (options.nonce)
        assertNonce(options.nonce, payload.nonce as string | undefined);
    return {
        tokenType: "id",
        subject: payload.sub,
        issuer: payload.iss,
        audience: audiences(payload),
        expiresAt: payload.exp,
        issuedAt: payload.iat,
        ...(typeof payload.nonce === "string" ? { nonce: payload.nonce } : {}),
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
        ...(typeof payload.email_verified === "boolean"
            ? { emailVerified: payload.email_verified }
            : {}),
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
        ...(typeof payload.preferred_username === "string"
            ? { preferredUsername: payload.preferred_username }
            : {}),
    };
}

export function clearJwksCache(): void {
    jwksCache.clear();
}
