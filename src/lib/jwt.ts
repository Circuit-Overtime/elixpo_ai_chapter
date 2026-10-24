import * as jose from "jose";
import { normalizeIssuer } from "./oauth-metadata";
import { generateUUID } from "./webcrypto";

export interface JWTPayload {
    sub: string;
    email: string;
    provider?: "google" | "github" | "discord" | "microsoft" | "email";
    scopes?: string[];
    iat: number;
    exp: number;
    type: "access" | "refresh" | "id";
    client_id?: string;
    aud?: string | string[];
    sid?: string;
}

export interface OAuthClaims {
    clientId?: string;
    audience?: string | string[];
    sid?: string;
}

export interface IdTokenClaims {
    nonce?: string;
    emailVerified?: boolean;
    name?: string | null;
    preferredUsername?: string | null;
}

let signingMetadataPromise:
    | Promise<{ key: jose.KeyLike | Uint8Array; kid: string }>
    | undefined;
let publicJwkPromise: Promise<jose.JWK> | undefined;

function getIssuer(): string {
    return normalizeIssuer(process.env.NEXT_PUBLIC_APP_URL);
}

export async function getSigningKey(): Promise<jose.KeyLike | Uint8Array> {
    const privateKeyPEM = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!privateKeyPEM) {
        throw new Error("JWT_PRIVATE_KEY not found in environment");
    }
    return jose.importPKCS8(privateKeyPEM, "EdDSA");
}

export async function getVerifyingKey(): Promise<jose.KeyLike | Uint8Array> {
    const publicKeyPEM = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n");
    if (!publicKeyPEM) {
        throw new Error("JWT_PUBLIC_KEY not found in environment");
    }
    return jose.importSPKI(publicKeyPEM, "EdDSA", { extractable: true });
}

async function getSigningMetadata() {
    signingMetadataPromise ??= (async () => {
        const key = await getSigningKey();
        const publicJwk = await getPublicJwk();
        return { key, kid: publicJwk.kid as string };
    })();
    return signingMetadataPromise;
}

export async function getPublicJwk(): Promise<jose.JWK> {
    publicJwkPromise ??= (async () => {
        const key = await getVerifyingKey();
        const jwk = await jose.exportJWK(key);
        const kid = await jose.calculateJwkThumbprint(jwk, "sha256");
        return { ...jwk, alg: "EdDSA", kid, use: "sig" };
    })();
    return publicJwkPromise;
}

export async function createAccessToken(
    userId: string,
    email: string,
    provider?: "google" | "github" | "discord" | "microsoft" | "email",
    expiresInMinutes: number = 15,
    scopes?: string[],
    oauthClaims?: OAuthClaims,
): Promise<string> {
    const payload: Omit<JWTPayload, "iat" | "exp"> = {
        sub: userId,
        email,
        type: "access",
        ...(provider && { provider }),
        ...(scopes && { scopes }),
        ...(oauthClaims?.clientId && { client_id: oauthClaims.clientId }),
        ...(oauthClaims?.sid && { sid: oauthClaims.sid }),
    };

    const { key, kid } = await getSigningMetadata();

    let builder = new jose.SignJWT(payload)
        .setProtectedHeader({ alg: "EdDSA", kid, typ: "at+jwt" })
        .setIssuer(getIssuer())
        .setJti(generateUUID())
        .setIssuedAt()
        .setExpirationTime(`${expiresInMinutes}m`);

    if (oauthClaims?.audience) {
        builder = builder.setAudience(oauthClaims.audience);
    }

    return await builder.sign(key);
}

export async function createRefreshToken(
    userId: string,
    provider?: "google" | "github" | "discord" | "microsoft" | "email",
    expiresInDays: number = 30,
    scopes?: string[],
    oauthClaims?: OAuthClaims,
): Promise<string> {
    const payload: Omit<JWTPayload, "iat" | "exp"> = {
        sub: userId,
        email: "",
        type: "refresh",
        ...(provider && { provider }),
        ...(scopes && { scopes }),
        ...(oauthClaims?.clientId && { client_id: oauthClaims.clientId }),
        ...(oauthClaims?.sid && { sid: oauthClaims.sid }),
    };

    const { key, kid } = await getSigningMetadata();

    let builder = new jose.SignJWT(payload)
        .setProtectedHeader({ alg: "EdDSA", kid, typ: "JWT" })
        .setIssuer(getIssuer())
        .setJti(generateUUID())
        .setIssuedAt()
        .setExpirationTime(`${expiresInDays}d`);

    if (oauthClaims?.audience) {
        builder = builder.setAudience(oauthClaims.audience);
    }

    return await builder.sign(key);
}

export async function createIdToken(
    userId: string,
    email: string,
    clientId: string,
    expiresInMinutes: number = 15,
    claims: IdTokenClaims = {},
): Promise<string> {
    const { key, kid } = await getSigningMetadata();
    const payload = {
        sub: userId,
        email,
        email_verified: claims.emailVerified ?? false,
        type: "id",
        ...(claims.nonce ? { nonce: claims.nonce } : {}),
        ...(claims.name ? { name: claims.name } : {}),
        ...(claims.preferredUsername
            ? { preferred_username: claims.preferredUsername }
            : {}),
    };

    return new jose.SignJWT(payload)
        .setProtectedHeader({ alg: "EdDSA", kid, typ: "JWT" })
        .setIssuer(getIssuer())
        .setAudience(clientId)
        .setSubject(userId)
        .setJti(generateUUID())
        .setIssuedAt()
        .setExpirationTime(`${expiresInMinutes}m`)
        .sign(key);
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
    try {
        const key = await getVerifyingKey();

        const verified = await jose.jwtVerify(token, key, {
            algorithms: ["EdDSA"],
        });

        return verified.payload as unknown as JWTPayload;
    } catch (error) {
        console.error("[JWT] Verification failed:", error);
        return null;
    }
}
