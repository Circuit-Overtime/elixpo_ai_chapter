import { describe, expect, it } from "vitest";
import {
    evaluateRefreshTokenForRotation,
    type RefreshTokenRow,
} from "../refresh-rotation";

describe("evaluateRefreshTokenForRotation", () => {
    const now = Date.UTC(2030, 0, 1);
    const validToken: RefreshTokenRow = {
        id: "1",
        token_hash: "hash",
        user_id: "user1",
        expires_at: new Date(now + 1000).toISOString(),
        revoked: 0,
        revoked_reason: null,
        family_id: "fam1",
        parent_token_hash: null,
        sid: "sid1",
        client_id: "test-client",
    };

    it("returns not_found_or_expired if token is missing", () => {
        expect(evaluateRefreshTokenForRotation(null, now)).toEqual({
            kind: "not_found_or_expired",
        });
    });

    it("returns not_found_or_expired if token is expired", () => {
        const expired = {
            ...validToken,
            expires_at: new Date(now - 1000).toISOString(),
        };
        expect(evaluateRefreshTokenForRotation(expired, now)).toEqual({
            kind: "not_found_or_expired",
        });
    });

    it("returns rotate for a valid, unrevoked token", () => {
        expect(evaluateRefreshTokenForRotation(validToken, now)).toEqual({
            kind: "rotate",
        });
    });

    it("detects reuse if token was explicitly rotated and has a family_id", () => {
        const reused = { ...validToken, revoked: 1, revoked_reason: "rotated" };
        expect(evaluateRefreshTokenForRotation(reused, now)).toEqual({
            kind: "reuse_detected",
            familyId: "fam1",
        });
    });

    it("returns not_found_or_expired for normal logouts (not reuse)", () => {
        const loggedOut = {
            ...validToken,
            revoked: 1,
            revoked_reason: "logout",
        };
        expect(evaluateRefreshTokenForRotation(loggedOut, now)).toEqual({
            kind: "not_found_or_expired",
        });
    });

    it("returns not_found_or_expired for account_revoke (not reuse)", () => {
        const accRevoked = {
            ...validToken,
            revoked: 1,
            revoked_reason: "account_revoke",
        };
        expect(evaluateRefreshTokenForRotation(accRevoked, now)).toEqual({
            kind: "not_found_or_expired",
        });
    });

    it("returns not_found_or_expired if revoked_reason is rotated but family_id is null (defensive)", () => {
        const broken = {
            ...validToken,
            revoked: 1,
            revoked_reason: "rotated",
            family_id: null,
        };
        expect(evaluateRefreshTokenForRotation(broken, now)).toEqual({
            kind: "not_found_or_expired",
        });
    });
});
