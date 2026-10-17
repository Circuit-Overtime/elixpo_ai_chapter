/**
 * TOTP (Time-based One-Time Password, RFC 6238) helpers.
 *
 * Wraps the `otpauth` library so the rest of the codebase only sees a
 * tight surface: generate a secret, render its enrollment URI, verify a
 * 6-digit code with a ±1 window for clock drift.
 *
 * The secret lives in D1 (user_mfa_factors.secret). It is never returned
 * to the client after the initial enrollment response — the client must
 * scan/copy it once, just like a backup code.
 */

import * as OTPAuth from "otpauth";

const ISSUER = "Elixpo Accounts";

export interface TotpEnrollment {
    secret: string; // base32, store in D1
    otpauth_uri: string; // for QR rendering
}

export function generateTotpSecret(accountLabel: string): TotpEnrollment {
    const secret = new OTPAuth.Secret({ size: 20 }); // 160-bit per RFC 4226
    const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        label: accountLabel,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
    });
    return {
        secret: secret.base32,
        otpauth_uri: totp.toString(),
    };
}

/**
 * Verify a 6-digit code against a stored base32 secret. window: 1 means
 * we accept the previous, current, or next 30-second step — covers the
 * typical client/server clock skew without significantly weakening the
 * one-time guarantee.
 */
export function verifyTotpCode(secretBase32: string, code: string): boolean {
    const trimmed = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(trimmed)) return false;
    try {
        const totp = new OTPAuth.TOTP({
            issuer: ISSUER,
            algorithm: "SHA1",
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(secretBase32),
        });
        const delta = totp.validate({ token: trimmed, window: 1 });
        return delta !== null;
    } catch {
        return false;
    }
}
