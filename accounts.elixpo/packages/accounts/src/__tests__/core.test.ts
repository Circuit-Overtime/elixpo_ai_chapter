import {
    calculateJwkThumbprint,
    exportJWK,
    generateKeyPair,
    SignJWT,
} from "jose";
import { describe, expect, it } from "vitest";
import {
    type AccountsError,
    assertNonce,
    assertState,
    createAuthorizationRequest,
    deriveCodeChallenge,
    discoverAccounts,
    exchangeAuthorizationCode,
    refreshTokens,
    revokeToken,
    verifyAccessToken,
    verifyIdToken,
} from "../core/index.js";
import type {
    AccountsConfiguration,
    AuthorizationServerMetadata,
} from "../core/types.js";

const issuer = "https://accounts.example.com";
const metadata: AuthorizationServerMetadata = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/auth/token`,
    userinfo_endpoint: `${issuer}/api/auth/me`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    revocation_endpoint: `${issuer}/api/auth/revoke`,
    scopes_supported: ["openid", "profile", "email"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
};

const configuration: AccountsConfiguration = {
    issuer,
    clientId: "cli_test",
    redirectUri: "https://app.example.com/callback",
    audience: "app.example.com",
};

describe("@elixpo/accounts core", () => {
    it("implements the RFC 7636 S256 vector", async () => {
        expect(
            await deriveCodeChallenge(
                "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
            ),
        ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    });

    it("rejects state and nonce mismatches without echoing their values", () => {
        expect(() => assertState("expected-secret", "actual-secret")).toThrow(
            "OAuth state did not match",
        );
        expect(() => assertNonce("expected-secret", "actual-secret")).toThrow(
            "ID token nonce did not match",
        );
    });

    it("builds an S256 authorization request and transaction", async () => {
        const result = await createAuthorizationRequest(
            metadata,
            configuration,
        );
        expect(result.url.searchParams.get("code_challenge_method")).toBe(
            "S256",
        );
        expect(result.url.searchParams.get("state")).toBe(
            result.transaction.state,
        );
        expect(result.transaction.codeVerifier).toHaveLength(43);
    });

    it("validates discovery issuer, origin, and PKCE support", async () => {
        const fetcher: typeof fetch = async (_input) =>
            new Response(JSON.stringify(metadata), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        await expect(
            discoverAccounts({ issuer, fetch: fetcher }),
        ).resolves.toEqual(metadata);
        await expect(
            discoverAccounts({
                issuer,
                fetch: async () =>
                    new Response(
                        JSON.stringify({
                            ...metadata,
                            issuer: "https://evil.example",
                        }),
                    ),
            }),
        ).rejects.toMatchObject({ code: "discovery_error" });
    });

    it("exchanges, rotates, and revokes without exposing credentials", async () => {
        const requests: URLSearchParams[] = [];
        const fetcher: typeof fetch = async (_input, init) => {
            requests.push(init?.body as URLSearchParams);
            return Response.json({
                access_token: "access-secret",
                refresh_token: "rotated-secret",
                token_type: "Bearer",
                expires_in: 900,
                scope: "openid email",
            });
        };
        const config = { ...configuration, fetch: fetcher };
        expect(
            (
                await exchangeAuthorizationCode(metadata, config, {
                    code: "code-secret",
                    codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
                })
            ).refreshToken,
        ).toBe("rotated-secret");
        expect(
            (await refreshTokens(metadata, config, "refresh-secret"))
                .refreshToken,
        ).toBe("rotated-secret");
        await expect(
            revokeToken(metadata, config, "refresh-secret"),
        ).resolves.toBeUndefined();
        expect(requests).toHaveLength(3);

        await expect(
            exchangeAuthorizationCode(
                metadata,
                {
                    ...configuration,
                    fetch: async () =>
                        Response.json(
                            {
                                error: "invalid_grant",
                                error_description: "code-secret",
                            },
                            { status: 400 },
                        ),
                },
                {
                    code: "code-secret",
                    codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
                },
            ),
        ).rejects.toSatisfy(
            (error: AccountsError) =>
                error.code === "oauth_error" &&
                !error.message.includes("code-secret"),
        );
    });

    it("verifies access and ID token claims with the published JWKS", async () => {
        const { privateKey, publicKey } = await generateKeyPair("EdDSA");
        const publicJwk = await exportJWK(publicKey);
        const kid = await calculateJwkThumbprint(publicJwk);
        const fetcher: typeof fetch = async () =>
            Response.json({
                keys: [{ ...publicJwk, kid, alg: "EdDSA", use: "sig" }],
            });
        const now = Math.floor(Date.now() / 1000);
        const access = await new SignJWT({
            type: "access",
            client_id: configuration.clientId,
            scopes: ["openid"],
        })
            .setProtectedHeader({ alg: "EdDSA", kid, typ: "at+jwt" })
            .setIssuer(issuer)
            .setAudience(configuration.audience as string)
            .setSubject("user_1")
            .setIssuedAt(now)
            .setExpirationTime(now + 300)
            .sign(privateKey);
        const id = await new SignJWT({ type: "id", nonce: "nonce_1" })
            .setProtectedHeader({ alg: "EdDSA", kid })
            .setIssuer(issuer)
            .setAudience(configuration.clientId)
            .setSubject("user_1")
            .setIssuedAt(now)
            .setExpirationTime(now + 300)
            .sign(privateKey);

        await expect(
            verifyAccessToken(access, metadata, {
                audience: configuration.audience as string,
                clientId: configuration.clientId,
                fetch: fetcher,
            }),
        ).resolves.toMatchObject({ subject: "user_1", tokenType: "access" });
        await expect(
            verifyIdToken(id, metadata, {
                clientId: configuration.clientId,
                nonce: "nonce_1",
                fetch: fetcher,
            }),
        ).resolves.toMatchObject({ subject: "user_1", tokenType: "id" });
    });
});
