/**
 * accounts.elixpo#80 — pure-logic tests only.
 *
 * Scope note (see PR-80-NOTES.md): this repo has no working D1-backed
 * test harness. `evaluateDeviceAuthorizationForResolution` and
 * `classifyDevicePollAttempt` were extracted specifically so the
 * pending/expired/denied/slow_down/client-mismatch/ready-to-exchange
 * *decisions* are testable here, exactly like the existing
 * `generateRawUserCode`/`normalizeUserCode` tests. The actual D1 reads
 * and the atomic `UPDATE ... WHERE status = 'pending'` / `WHERE
 * exchanged_at IS NULL` writes that consume these decisions are NOT
 * covered by any test in this repo, for #79/#80 either — that gap is
 * explicit, not silently absent.
 */

import { describe, expect, it } from "vitest";
import {
    classifyDevicePollAttempt,
    evaluateDeviceAuthorizationForResolution,
} from "../device-auth-service";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const FUTURE = new Date("2026-08-06T12:10:00.000Z").toISOString();
const PAST = new Date("2026-08-06T11:00:00.000Z").toISOString();

describe("evaluateDeviceAuthorizationForResolution", () => {
    it("allows resolving a pending, unexpired row", () => {
        const result = evaluateDeviceAuthorizationForResolution(
            { status: "pending", expires_at: FUTURE },
            NOW,
        );
        expect(result).toEqual({ canResolve: true });
    });

    it("treats a pending-but-past-expiry row as expired, not resolvable", () => {
        const result = evaluateDeviceAuthorizationForResolution(
            { status: "pending", expires_at: PAST },
            NOW,
        );
        expect(result).toEqual({ canResolve: false, reason: "expired" });
    });

    it("treats an already-approved row as already_resolved", () => {
        const result = evaluateDeviceAuthorizationForResolution(
            { status: "approved", expires_at: FUTURE },
            NOW,
        );
        expect(result).toEqual({
            canResolve: false,
            reason: "already_resolved",
        });
    });

    it("treats an already-denied row as already_resolved", () => {
        const result = evaluateDeviceAuthorizationForResolution(
            { status: "denied", expires_at: FUTURE },
            NOW,
        );
        expect(result).toEqual({
            canResolve: false,
            reason: "already_resolved",
        });
    });

    it("treats a row already marked expired as already_resolved-shaped (expired branch), not a crash", () => {
        // status === "expired" (already transitioned by the cleanup cron
        // or a prior poll) falls into the `row.status !== "pending"`
        // branch, i.e. already_resolved — same outcome as any other
        // terminal, non-pending status.
        const result = evaluateDeviceAuthorizationForResolution(
            { status: "expired", expires_at: PAST },
            NOW,
        );
        expect(result).toEqual({
            canResolve: false,
            reason: "already_resolved",
        });
    });
});

describe("classifyDevicePollAttempt", () => {
    const baseRow = {
        client_id: "cli_test",
        status: "pending",
        user_id: null as string | null,
        interval_seconds: 5,
        last_polled_at: null as string | null,
        expires_at: FUTURE,
    };

    it("flags client substitution before evaluating anything else", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, status: "approved", user_id: "u1" },
            "some-other-client",
            NOW,
        );
        expect(result).toEqual({ kind: "client_mismatch" });
    });

    it("returns access_denied for a denied row", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, status: "denied" },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "access_denied" });
    });

    it("returns expired_token for a status already 'expired'", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, status: "expired", expires_at: PAST },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "expired_token", wasPending: false });
    });

    it("returns expired_token(wasPending: true) for a pending row past its expiry", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, status: "pending", expires_at: PAST },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "expired_token", wasPending: true });
    });

    it("returns authorization_pending on a first poll (no last_polled_at yet)", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, last_polled_at: null },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "authorization_pending" });
    });

    it("returns authorization_pending once the interval has elapsed", () => {
        const sixSecondsAgo = new Date(NOW.getTime() - 6000).toISOString();
        const result = classifyDevicePollAttempt(
            { ...baseRow, last_polled_at: sixSecondsAgo, interval_seconds: 5 },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "authorization_pending" });
    });

    it("returns slow_down with backed-off interval when polled before the interval elapses", () => {
        const twoSecondsAgo = new Date(NOW.getTime() - 2000).toISOString();
        const result = classifyDevicePollAttempt(
            { ...baseRow, last_polled_at: twoSecondsAgo, interval_seconds: 5 },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "slow_down", newIntervalSeconds: 10 });
    });

    it("compounds the backoff on repeated fast polls (interval already widened)", () => {
        const oneSecondAgo = new Date(NOW.getTime() - 1000).toISOString();
        const result = classifyDevicePollAttempt(
            { ...baseRow, last_polled_at: oneSecondAgo, interval_seconds: 10 },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "slow_down", newIntervalSeconds: 15 });
    });

    it("returns ready_to_exchange for an approved row with a user_id", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, status: "approved", user_id: "u1" },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "ready_to_exchange" });
    });

    it("returns expired_token for an approved row past its expiry", () => {
        const result = classifyDevicePollAttempt(
            {
                ...baseRow,
                status: "approved",
                user_id: "u1",
                expires_at: PAST,
            },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "expired_token", wasPending: false });
    });

    it("returns not_exchangeable for an approved row missing user_id (defensive/should-never-happen)", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, status: "approved", user_id: null },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "not_exchangeable" });
    });

    it("returns not_exchangeable for any other unrecognized status (defensive)", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, status: "exchanged" },
            "cli_test",
            NOW,
        );
        expect(result).toEqual({ kind: "not_exchangeable" });
    });

    it("checks client_mismatch ahead of expiry — a wrong client learns invalid_grant, not expired_token", () => {
        const result = classifyDevicePollAttempt(
            { ...baseRow, status: "pending", expires_at: PAST },
            "some-other-client",
            NOW,
        );
        expect(result).toEqual({ kind: "client_mismatch" });
    });
});
