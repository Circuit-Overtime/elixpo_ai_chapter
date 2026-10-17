import { describe, expect, it } from "vitest";
import {
    generateRawDeviceCode,
    generateRawUserCode,
    isRequestedAudienceAllowed,
    normalizeUserCode,
} from "../device-auth-service";

const AMBIGUOUS_CHARS = ["0", "O", "1", "I", "L"];

describe("isRequestedAudienceAllowed", () => {
    it("allows when no audience is requested", () => {
        expect(isRequestedAudienceAllowed(null, "api.example.com")).toBe(true);
        expect(isRequestedAudienceAllowed(undefined, undefined)).toBe(true);
    });

    it("denies when audience is requested but client has none approved", () => {
        expect(isRequestedAudienceAllowed("api.example.com", null)).toBe(false);
    });

    it("allows when requested audience exactly matches approved audience", () => {
        expect(
            isRequestedAudienceAllowed("api.example.com", "api.example.com"),
        ).toBe(true);
    });

    it("denies when requested audience mismatches approved audience", () => {
        expect(
            isRequestedAudienceAllowed("api.example.com", "other.example.com"),
        ).toBe(false);
    });
});

describe("generateRawUserCode", () => {
    it("returns an 8-character code formatted as XXXX-XXXX", () => {
        const code = generateRawUserCode();
        expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it("never contains visually ambiguous characters", () => {
        for (let i = 0; i < 200; i++) {
            const code = generateRawUserCode();
            for (const ambiguous of AMBIGUOUS_CHARS) {
                expect(code).not.toContain(ambiguous);
            }
        }
    });

    it("returns different values on successive calls", () => {
        const codes = new Set(Array.from({ length: 200 }, generateRawUserCode));
        // With ~31^8 possible codes, 200 draws colliding would indicate a
        // broken generator, not bad luck.
        expect(codes.size).toBe(200);
    });
});

describe("generateRawDeviceCode", () => {
    it("is prefixed and high entropy", () => {
        const code = generateRawDeviceCode();
        expect(code).toMatch(/^dvc_[0-9a-f]{64}$/);
    });

    it("returns different values on successive calls", () => {
        expect(generateRawDeviceCode()).not.toBe(generateRawDeviceCode());
    });
});

describe("normalizeUserCode", () => {
    it("uppercases, strips dashes, and strips whitespace", () => {
        expect(normalizeUserCode("wdjb-mjht")).toBe("WDJBMJHT");
        expect(normalizeUserCode("WDJB MJHT")).toBe("WDJBMJHT");
        expect(normalizeUserCode("  wdjbmjht  ")).toBe("WDJBMJHT");
    });

    it("produces the same normalized value regardless of input formatting", () => {
        const variants = ["wdjb-mjht", "WDJB-MJHT", "wdjb mjht", "wdjbmjht"];
        const normalized = variants.map(normalizeUserCode);
        expect(new Set(normalized).size).toBe(1);
    });

    it("strips characters outside A-Z0-9", () => {
        expect(normalizeUserCode("wd!jb@mj#ht")).toBe("WDJBMJHT");
    });
});
