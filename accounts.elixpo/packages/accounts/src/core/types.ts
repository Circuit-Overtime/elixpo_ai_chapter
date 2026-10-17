export type OAuthErrorCode =
    | "access_denied"
    | "authorization_pending"
    | "expired_token"
    | "invalid_client"
    | "invalid_grant"
    | "invalid_request"
    | "invalid_scope"
    | "server_error"
    | "slow_down"
    | "temporarily_unavailable"
    | "unsupported_grant_type"
    | "unsupported_response_type";

export interface AuthorizationServerMetadata {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    device_authorization_endpoint?: string;
    revocation_endpoint: string;
    scopes_supported: string[];
    grant_types_supported: string[];
    response_types_supported: string[];
    token_endpoint_auth_methods_supported: string[];
    revocation_endpoint_auth_methods_supported?: string[];
    code_challenge_methods_supported: string[];
    subject_types_supported?: string[];
    id_token_signing_alg_values_supported?: string[];
    claims_supported?: string[];
    elixpo_contract_version?: string;
    elixpo_min_compatible_sdk_version?: string;
}

export interface AccountsConfiguration {
    issuer: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    audience?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}

export interface AuthorizationTransaction {
    state: string;
    nonce: string;
    codeVerifier: string;
    createdAt: number;
}

export interface TokenSet {
    accessToken: string;
    refreshToken: string;
    idToken?: string;
    tokenType: "Bearer";
    expiresIn: number;
    scope: string[];
}

export interface VerifiedAccessToken {
    tokenType: "access";
    subject: string;
    issuer: string;
    audience: string[];
    clientId: string;
    expiresAt: number;
    issuedAt: number;
    scopes: string[];
    sessionId?: string;
    email?: string;
}

export interface VerifiedIdToken {
    tokenType: "id";
    subject: string;
    issuer: string;
    audience: string[];
    expiresAt: number;
    issuedAt: number;
    nonce?: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
    preferredUsername?: string;
}
