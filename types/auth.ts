/**
 * Authentication Types and Interfaces
 * Used throughout the auth system
 */

export interface User {
    id: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    lastLogin?: Date;
    isActive: boolean;
}

export interface Identity {
    id: string;
    userId: string;
    provider: "google" | "github" | "discord";
    providerUserId: string;
    providerEmail?: string;
    providerProfileUrl?: string;
    verified: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface AuthRequest {
    id: string;
    state: string;
    nonce: string;
    pkceVerifier: string;
    provider: string;
    clientId: string;
    redirectUri: string;
    scopes?: string;
    createdAt: Date;
    expiresAt: Date;
}

export interface RefreshToken {
    id: string;
    userId: string;
    tokenHash: string;
    clientId?: string;
    createdAt: Date;
    expiresAt: Date;
    revoked: boolean;
    revokedAt?: Date;
}

export interface OAuthClient {
    clientId: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
    createdAt: Date;
    isActive: boolean;
}

export interface AuditLog {
    id: string;
    userId?: string;
    eventType:
        | "login"
        | "logout"
        | "token_refresh"
        | "password_change"
        | "mfa_enabled"
        | "mfa_disabled";
    provider?: string;
    ipAddress?: string;
    userAgent?: string;
    status: "success" | "failure";
    errorMessage?: string;
    createdAt: Date;
}

export interface SSO {
    /**
     * Verify an access token
     */
    verify(token: string): Promise<{ userId: string; email: string } | null>;

    /**
     * Validate refresh token and issue new access token
     */
    refresh(refreshToken: string): Promise<string | null>;

    /**
     * Revoke refresh token
     */
    revoke(refreshToken: string): Promise<boolean>;
}
