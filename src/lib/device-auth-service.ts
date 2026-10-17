/**
 * Device Authorization Grant (RFC 8628) service.
 *
 * accounts.elixpo#79 (part of #73) — protocol + persistence only. The
 * verification UI and the token-endpoint polling grant are separate,
 * downstream issues; this module is the shared foundation both will call
 * into.
 *
 * Hard rule: raw device_code and raw user_code are generated, returned to
 * the caller once, and then discarded. Only their SHA-256 hashes are ever
 * written to D1, logged, or placed in audit metadata.
 */

import type { D1Database } from "@cloudflare/workers-types";
import {
    type CustomOAuthScope,
    findScopeOption,
    parseCustomScopes,
} from "./oauth-scope-registry";
import { generateRandomString, generateUUID, hashString } from "./webcrypto";

const DEVICE_CODE_PREFIX = "dvc_";
const DEFAULT_EXPIRES_IN_SECONDS = 600; // 10 minutes — RFC 8628 typical range
const DEFAULT_INTERVAL_SECONDS = 2;
const MAX_CODE_GENERATION_ATTEMPTS = 5;

// Excludes visually ambiguous characters (0/O, 1/I/L) so a user transcribing
// the code from a second screen doesn't have to guess.
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export type DeviceAuthorizationError =
    | "invalid_request"
    | "invalid_client"
    | "invalid_scope"
    | "server_error";

export class DeviceAuthorizationRequestError extends Error {
    constructor(
        public readonly code: DeviceAuthorizationError,
        message: string,
    ) {
        super(message);
        this.name = "DeviceAuthorizationRequestError";
    }
}

export interface DeviceAuthorizationResult {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
}

/**
 * Cryptographically uniform pick from `alphabet` via rejection sampling
 * (same technique as `generateNumericOtp` in webcrypto.ts) — avoids the
 * modulo-bias CodeQL flags on `getRandomValues() % n`.
 */
function pickFromAlphabet(alphabet: string): string {
    const space = alphabet.length;
    // Largest multiple of `space` that fits in a byte, so rejection is rare.
    const limit = 256 - (256 % space);
    let byte: number;
    do {
        byte = crypto.getRandomValues(new Uint8Array(1))[0];
    } while (byte >= limit);
    return alphabet[byte % space];
}

/** Exported for unit testing (format/entropy/charset) — not part of the HTTP surface. */
export function generateRawUserCode(): string {
    const chars = Array.from({ length: 8 }, () =>
        pickFromAlphabet(USER_CODE_ALPHABET),
    );
    return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Exported for unit testing (format/entropy/prefix) — not part of the HTTP surface. */
export function generateRawDeviceCode(): string {
    return `${DEVICE_CODE_PREFIX}${generateRandomString(32)}`;
}

/** Strip formatting and case so "wdjb mjht", "WDJB-MJHT", "wdjbmjht" all match. */
export function normalizeUserCode(input: string): string {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function hashUserCode(rawUserCode: string): Promise<string> {
    return hashString(normalizeUserCode(rawUserCode));
}

function verificationUris(appUrl: string, userCode: string) {
    const verification_uri = `${appUrl}/device`;
    const verification_uri_complete = `${verification_uri}?user_code=${encodeURIComponent(userCode)}`;
    return { verification_uri, verification_uri_complete };
}

interface OAuthClientRow {
    client_id: string;
    client_type: string;
    is_active: number;
    scopes: string;
    audience: string | null;
    custom_scopes: string;
}

export interface CreateDeviceAuthorizationInput {
    clientId: string;
    /** Space-delimited requested scopes; falls back to the client's full registered grant when omitted. */
    scope?: string;
    audience?: string;
    ipAddress: string;
    appUrl: string;
}

export async function createDeviceAuthorization(
    db: D1Database,
    input: CreateDeviceAuthorizationInput,
): Promise<DeviceAuthorizationResult> {
    const { clientId, audience, ipAddress, appUrl } = input;

    if (!clientId) {
        throw new DeviceAuthorizationRequestError(
            "invalid_request",
            "client_id is required",
        );
    }

    const client = (await db
        .prepare(
            "SELECT client_id, client_type, is_active, scopes, audience, custom_scopes FROM oauth_clients WHERE client_id = ?",
        )
        .bind(clientId)
        .first()) as OAuthClientRow | null;

    // Same generic error whether the client doesn't exist, is inactive, or
    // is a confidential (non-device) client — don't leak which.
    if (client?.is_active !== 1 || client.client_type !== "public") {
        throw new DeviceAuthorizationRequestError(
            "invalid_client",
            "Unknown or ineligible client",
        );
    }

    if (!isRequestedAudienceAllowed(audience, client.audience)) {
        throw new DeviceAuthorizationRequestError(
            "invalid_request",
            "Requested audience is not registered for this client",
        );
    }

    const clientScopes: string[] = JSON.parse(client.scopes || "[]");
    const customScopes = parseCustomScopes(client.custom_scopes);
    const requestedScopes = input.scope
        ? [...new Set(input.scope.split(/\s+/).filter(Boolean))]
        : clientScopes;

    if (requestedScopes.length === 0) {
        throw new DeviceAuthorizationRequestError(
            "invalid_scope",
            "No scopes requested or registered for this client",
        );
    }

    const scopesValid = requestedScopes.every(
        (scope) =>
            !!findScopeOption(scope, customScopes) &&
            clientScopes.includes(scope),
    );
    if (!scopesValid) {
        throw new DeviceAuthorizationRequestError(
            "invalid_scope",
            "Requested scope is not registered for this client",
        );
    }

    const expiresAt = new Date(
        Date.now() + DEFAULT_EXPIRES_IN_SECONDS * 1000,
    ).toISOString();

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
        const rawDeviceCode = generateRawDeviceCode();
        const rawUserCode = generateRawUserCode();
        const deviceCodeHash = await hashString(rawDeviceCode);
        const userCodeHash = await hashUserCode(rawUserCode);

        try {
            await db
                .prepare(
                    `INSERT INTO device_authorizations (
                        id, device_code_hash, user_code_hash, client_id, audience,
                        scopes, status, interval_seconds, ip_address, expires_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
                )
                .bind(
                    generateUUID(),
                    deviceCodeHash,
                    userCodeHash,
                    clientId,
                    audience ?? client.audience,
                    requestedScopes.join(" "),
                    DEFAULT_INTERVAL_SECONDS,
                    ipAddress,
                    expiresAt,
                )
                .run();

            const { verification_uri, verification_uri_complete } =
                verificationUris(appUrl, rawUserCode);

            return {
                device_code: rawDeviceCode,
                user_code: rawUserCode,
                verification_uri,
                verification_uri_complete,
                expires_in: DEFAULT_EXPIRES_IN_SECONDS,
                interval: DEFAULT_INTERVAL_SECONDS,
            };
        } catch (error) {
            // Unique-constraint collision on either hash — vanishingly
            // unlikely at this entropy, but retry with fresh codes rather
            // than fail the request.
            lastError = error;
        }
    }

    console.error(
        "[DeviceAuth] Failed to allocate a unique device/user code after retries:",
        lastError,
    );
    throw new DeviceAuthorizationRequestError(
        "server_error",
        "Failed to issue device authorization",
    );
}

export type DeviceAuthorizationLookupStatus =
    | "pending"
    | "approved"
    | "denied"
    | "expired"
    | "not_found";

export interface DeviceAuthorizationLookupResult {
    status: DeviceAuthorizationLookupStatus;
    client_id?: string;
    client_name?: string;
    scopes?: string[];
    expires_at?: string;
    logo_url?: string | null;
    branding_display_name?: string | null;
    branding_primary_color?: string | null;
    branding_accent_color?: string | null;
    privacy_policy_url?: string | null;
    terms_of_service_url?: string | null;
    is_branding_verified?: boolean;
    branding_verified_domain?: string | null;
    audience?: string | null;
    custom_scopes?: CustomOAuthScope[];
}

/**
 * Resolve a user-entered code for the (future) verification page. Read-only
 * — approval/denial is a separate, session-authenticated, CSRF-protected
 * action that belongs to that page's own issue, not here.
 */
export async function lookupDeviceAuthorizationByUserCode(
    db: D1Database,
    rawUserCode: string,
): Promise<DeviceAuthorizationLookupResult> {
    const userCodeHash = await hashUserCode(rawUserCode);

    const row = (await db
        .prepare(
            `SELECT da.status, da.expires_at, da.scopes, da.audience, da.client_id, oc.name AS client_name, oc.custom_scopes, oc.logo_url, oc.branding_display_name, oc.branding_primary_color, oc.branding_accent_color, oc.privacy_policy_url, oc.terms_of_service_url, oc.is_branding_verified, oc.branding_verified_domain
             FROM device_authorizations da
             JOIN oauth_clients oc ON oc.client_id = da.client_id
             WHERE da.user_code_hash = ?`,
        )
        .bind(userCodeHash)
        .first()) as {
        status: string;
        expires_at: string;
        scopes: string;
        client_id: string;
        client_name: string;
        logo_url: string | null;
        branding_display_name: string | null;
        branding_primary_color: string | null;
        branding_accent_color: string | null;
        privacy_policy_url: string | null;
        terms_of_service_url: string | null;
        is_branding_verified: number;
        branding_verified_domain: string | null;
        audience: string | null;
        custom_scopes: string;
    } | null;

    if (!row) {
        return { status: "not_found" };
    }

    const expired =
        new Date(
            row.expires_at.endsWith("Z") || row.expires_at.includes("+")
                ? row.expires_at
                : `${row.expires_at} Z`,
        ) <= new Date();

    return {
        status: expired
            ? "expired"
            : (row.status as DeviceAuthorizationLookupStatus),
        client_id: row.client_id,
        client_name: row.client_name,
        scopes: row.scopes.split(" ").filter(Boolean),
        expires_at: row.expires_at,
        audience: row.audience,
        custom_scopes: parseCustomScopes(row.custom_scopes),
        logo_url: row.is_branding_verified === 1 ? row.logo_url || null : null,
        branding_display_name:
            row.is_branding_verified === 1
                ? row.branding_display_name || null
                : null,
        branding_primary_color:
            row.is_branding_verified === 1
                ? row.branding_primary_color || null
                : null,
        branding_accent_color:
            row.is_branding_verified === 1
                ? row.branding_accent_color || null
                : null,
        privacy_policy_url:
            row.is_branding_verified === 1
                ? row.privacy_policy_url || null
                : null,
        terms_of_service_url:
            row.is_branding_verified === 1
                ? row.terms_of_service_url || null
                : null,
        is_branding_verified: row.is_branding_verified === 1,
        branding_verified_domain:
            row.is_branding_verified === 1
                ? row.branding_verified_domain || null
                : null,
    };
}

/**
 * Bounded expiry cleanup. Deletes rows past `expires_at` in batches
 * so a single cron/cleanup tick can never lock the table for an unbounded
 * scan. Approved/denied rows are left in place for their natural expiry —
 * downstream token-polling logic (separate issue) still needs to answer
 * "expired_token" without retaining resolved grants indefinitely.
 */
export async function cleanupExpiredDeviceAuthorizations(
    db: D1Database,
    limit = 500,
): Promise<number> {
    const result = await db
        .prepare(
            `DELETE FROM device_authorizations
             WHERE id IN (
                SELECT id FROM device_authorizations
                WHERE expires_at < CURRENT_TIMESTAMP
                LIMIT ?
             )`,
        )
        .bind(limit)
        .run();

    return (result as any)?.meta?.changes ?? 0;
}
/**
 * accounts.elixpo#80 additions — appended to the existing
 * src/lib/device-auth-service.ts (from #79 / PR #83), below
 * cleanupExpiredDeviceAuthorizations(). Nothing above this point is
 * touched; `hashUserCode` below is the existing private helper already
 * in the file, reused directly rather than re-exported (these functions
 * live in the same module, so no export is needed).
 *
 * Design note per the #80 handoff: these take the raw `user_code`, not
 * `id` — the verification page and the approve/deny routes only ever
 * have the human-typed code, never the internal row id, so hashing here
 * (mirroring lookupDeviceAuthorizationByUserCode's own normalize-then-
 * hash pattern) avoids requiring a second, id-based lookup step upstream.
 *
 * TEST COVERAGE NOTE: this repo has no working D1-backed test harness —
 * #79 tried `@cloudflare/vitest-pool-workers` and explicitly gave up on
 * it (API mismatch with `defineWorkersConfig`), and `createInMemoryMockDb`
 * in d1-client.ts doesn't round-trip inserts/updates, so it can't
 * meaningfully test an `UPDATE ... WHERE status = 'pending'` guard. Per
 * the #80 PR discussion, rather than leave the pending/expired/
 * already-resolved branching untested, it's extracted below into
 * `evaluateDeviceAuthorizationForResolution` — a pure function with no DB
 * access, testable with plain vitest exactly like `normalizeUserCode`
 * above. approveDeviceAuthorization/denyDeviceAuthorization call it and
 * then perform the one remaining untested piece: the atomic UPDATE
 * itself. That gap is real and explicit, not silently fixed here — see
 * PR-80-NOTES.md.
 */

export interface DeviceAuthorizationStatusRow {
    status: string;
    expires_at: string;
}

export type DeviceAuthorizationResolutionOutcome =
    | { canResolve: true }
    | { canResolve: false; reason: "already_resolved" | "expired" };

/**
 * Pure decision: given a device_authorizations row's status/expires_at,
 * can an approve/deny action proceed against it right now? Mirrors
 * lookupDeviceAuthorizationByUserCode's own not_found/expired collapsing
 * — an approve/deny attempt on an expired-but-still-"pending" row should
 * read the same as acting on something that no longer exists, not a
 * distinct third outcome.
 */
export function evaluateDeviceAuthorizationForResolution(
    row: DeviceAuthorizationStatusRow,
    now: Date = new Date(),
): DeviceAuthorizationResolutionOutcome {
    if (row.status === "pending" && new Date(row.expires_at) <= now) {
        return { canResolve: false, reason: "expired" };
    }
    if (row.status !== "pending") {
        return { canResolve: false, reason: "already_resolved" };
    }
    return { canResolve: true };
}

export interface ResolveDeviceAuthorizationInput {
    userCode: string;
    userId: string;
    ipAddress?: string;
}

export type DeviceAuthorizationResolutionResult =
    | { ok: true; clientId: string }
    | { ok: false; reason: "not_found" | "already_resolved" | "expired" };

export async function approveDeviceAuthorization(
    db: D1Database,
    input: ResolveDeviceAuthorizationInput,
): Promise<DeviceAuthorizationResolutionResult> {
    const userCodeHash = await hashUserCode(input.userCode);

    const row = (await db
        .prepare(
            "SELECT id, client_id, status, expires_at FROM device_authorizations WHERE user_code_hash = ?",
        )
        .bind(userCodeHash)
        .first()) as {
        id: string;
        client_id: string;
        status: string;
        expires_at: string;
    } | null;

    if (!row) {
        return { ok: false, reason: "not_found" };
    }

    const decision = evaluateDeviceAuthorizationForResolution(row);
    if (!decision.canResolve) {
        return { ok: false, reason: decision.reason };
    }

    // Atomic guard against a concurrent approve/deny race on the same
    // request — same `UPDATE ... WHERE status = 'pending'` + changes-count
    // check pattern cleanupExpiredDeviceAuthorizations already uses.
    // NOT covered by the pure-function tests above — see the test
    // coverage note at the top of this file.
    const result = await db
        .prepare(
            "UPDATE device_authorizations SET status = 'approved', user_id = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP",
        )
        .bind(input.userId, row.id)
        .run();

    if (result.meta.changes !== 1) {
        return { ok: false, reason: "already_resolved" };
    }

    return { ok: true, clientId: row.client_id };
}

export async function denyDeviceAuthorization(
    db: D1Database,
    input: ResolveDeviceAuthorizationInput,
): Promise<DeviceAuthorizationResolutionResult> {
    const userCodeHash = await hashUserCode(input.userCode);

    const row = (await db
        .prepare(
            "SELECT id, client_id, status, expires_at FROM device_authorizations WHERE user_code_hash = ?",
        )
        .bind(userCodeHash)
        .first()) as {
        id: string;
        client_id: string;
        status: string;
        expires_at: string;
    } | null;

    if (!row) {
        return { ok: false, reason: "not_found" };
    }

    const decision = evaluateDeviceAuthorizationForResolution(row);
    if (!decision.canResolve) {
        return { ok: false, reason: decision.reason };
    }

    const result = await db
        .prepare(
            "UPDATE device_authorizations SET status = 'denied', denied_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP",
        )
        .bind(row.id)
        .run();

    if (result.meta.changes !== 1) {
        return { ok: false, reason: "already_resolved" };
    }

    return { ok: true, clientId: row.client_id };
}

/**
 * Pure classifier for the token endpoint's device_code polling grant
 * (RFC 8628 §3.5). Given the stored row, the polling client_id, and the
 * current time, decides what should happen next — WITHOUT touching the
 * DB. token/route.ts's device_code branch calls this once per poll, then
 * performs exactly the DB write (if any) each outcome implies and builds
 * the HTTP response. Extracted so every branch — pending, denied,
 * expired, slow_down (with backoff math), client substitution, and
 * ready-to-exchange — is testable with plain vitest, same as
 * normalizeUserCode/evaluateDeviceAuthorizationForResolution above.
 *
 * Deliberately does NOT decide the atomic exchange-claim outcome
 * (`exchanged_at IS NULL` race) — that UPDATE's result can only be known
 * by actually running it against D1, so "ready_to_exchange" is as far as
 * a pure function can take this decision. See the test coverage note at
 * the top of this file for why that one piece stays untested here.
 */
export interface DevicePollRow {
    client_id: string;
    status: string;
    user_id: string | null;
    interval_seconds: number;
    last_polled_at: string | null;
    expires_at: string;
}

export type DevicePollClassification =
    | { kind: "client_mismatch" }
    | { kind: "access_denied" }
    | { kind: "expired_token"; wasPending: boolean }
    | { kind: "slow_down"; newIntervalSeconds: number }
    | { kind: "authorization_pending" }
    | { kind: "ready_to_exchange" }
    | { kind: "not_exchangeable" };

export function classifyDevicePollAttempt(
    row: DevicePollRow,
    requestingClientId: string,
    now: Date = new Date(),
): DevicePollClassification {
    if (row.client_id !== requestingClientId) {
        return { kind: "client_mismatch" };
    }

    const expiresAt = new Date(
        row.expires_at.endsWith("Z") || row.expires_at.includes("+")
            ? row.expires_at
            : `${row.expires_at} Z`,
    );
    if (row.status === "expired" || expiresAt <= now) {
        return { kind: "expired_token", wasPending: row.status === "pending" };
    }

    if (row.status === "denied") {
        return { kind: "access_denied" };
    }

    if (row.status === "pending") {
        const lastPolledAt = row.last_polled_at
            ? new Date(
                  row.last_polled_at.endsWith("Z") ||
                      row.last_polled_at.includes("+")
                      ? row.last_polled_at
                      : `${row.last_polled_at} Z`,
              )
            : null;
        const elapsedSeconds = lastPolledAt
            ? (now.getTime() - lastPolledAt.getTime()) / 1000
            : Number.POSITIVE_INFINITY;

        if (elapsedSeconds < row.interval_seconds) {
            return {
                kind: "slow_down",
                newIntervalSeconds: row.interval_seconds + 5,
            };
        }
        return { kind: "authorization_pending" };
    }

    if (row.status === "approved" && row.user_id) {
        return { kind: "ready_to_exchange" };
    }

    return { kind: "not_exchangeable" };
}

/**
 * PURE FUNCTION: Verifies if a requested audience is permitted for this client.
 * Prevents confused-deputy attacks where a public client requests tokens for an unapproved resource.
 */
export function isRequestedAudienceAllowed(
    requestedAudience: string | null | undefined,
    clientApprovedAudience: string | null | undefined,
): boolean {
    // If no specific audience is requested, it defaults safely to the client's registered audience
    if (!requestedAudience) return true;
    // If requested, but the client has no approved audience at all, deny
    if (!clientApprovedAudience) return false;
    // Require exact string match
    return requestedAudience === clientApprovedAudience;
}
