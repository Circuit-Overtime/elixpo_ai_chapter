import { SUPPORTED_PRODUCT_SCOPES } from "./oauth-scope-registry";
import { SUPPORTED_OAUTH_SCOPES } from "./oauth-scopes";

export const ELIXPO_OAUTH_CONTRACT_VERSION = "1.1.0";

export function normalizeIssuer(value?: string): string {
    return (value || "https://accounts.elixpo.com").replace(/\/$/, "");
}

export function createAuthorizationServerMetadata(issuerValue?: string) {
    const issuer = normalizeIssuer(issuerValue);

    return {
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/api/auth/token`,
        userinfo_endpoint: `${issuer}/api/auth/me`,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        device_authorization_endpoint: `${issuer}/api/auth/device/authorize`,
        revocation_endpoint: `${issuer}/api/auth/revoke`,
        scopes_supported: [
            ...SUPPORTED_OAUTH_SCOPES,
            ...SUPPORTED_PRODUCT_SCOPES,
        ],
        grant_types_supported: [
            "authorization_code",
            "refresh_token",
            "urn:ietf:params:oauth:grant-type:device_code",
        ],
        response_types_supported: ["code"],
        response_modes_supported: ["query"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
        revocation_endpoint_auth_methods_supported: [
            "client_secret_post",
            "none",
        ],
        code_challenge_methods_supported: ["S256"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["EdDSA"],
        claims_supported: [
            "sub",
            "iss",
            "aud",
            "exp",
            "iat",
            "nonce",
            "email",
            "email_verified",
            "name",
            "preferred_username",
        ],
        elixpo_contract_version: ELIXPO_OAUTH_CONTRACT_VERSION,
        elixpo_min_compatible_sdk_version: "1.0.1",
        elixpo_min_compatible_cli_version: "0.1.0",
        elixpo_access_token_lifetime_seconds:
            parseInt(process.env.JWT_EXPIRATION_MINUTES || "15", 10) * 60,
        elixpo_refresh_token_lifetime_seconds:
            parseInt(process.env.REFRESH_TOKEN_EXPIRATION_DAYS || "30", 10) *
            86400,
        elixpo_refresh_token_rotation: {
            policy: "rotate_always",
            reuse_action: "revoke_family",
        },
        elixpo_device_flow_polling: {
            interval_seconds: 2,
            max_attempts: 300,
            slow_down_interval_seconds: 10,
        },
    } as const;
}
