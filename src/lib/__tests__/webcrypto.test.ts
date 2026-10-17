import { describe, expect, it } from "vitest";
import {
    generateNonce,
    generatePKCE,
    generateRandomString,
    generateState,
    generateUUID,
    hashString,
} from "../webcrypto";

describe("generateUUID", () => {
    it("returns a valid v4 UUID", () => {
        expect(generateUUID()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });

    it("returns a unique value on each call", () => {
        const ids = new Set(Array.from({ length: 100 }, generateUUID));
        expect(ids.size).toBe(100);
    });
});

describe("generateRandomString", () => {
    it("returns a hex string of 2*length chars (one byte = two hex chars)", () => {
        for (const len of [8, 16, 32, 64]) {
            const s = generateRandomString(len);
            expect(s).toHaveLength(len * 2);
            expect(s).toMatch(/^[0-9a-f]+$/);
        }
    });

    it("returns different values on successive calls", () => {
        expect(generateRandomString(32)).not.toBe(generateRandomString(32));
    });

    it("defaults to 32 bytes (64 hex chars)", () => {
        expect(generateRandomString()).toHaveLength(64);
    });
});

describe("generateState / generateNonce", () => {
    it("state is 64 hex chars (32 bytes)", () => {
        expect(generateState()).toMatch(/^[0-9a-f]{64}$/);
    });

    it("nonce is 32 hex chars (16 bytes)", () => {
        expect(generateNonce()).toMatch(/^[0-9a-f]{32}$/);
    });
});

describe("hashString", () => {
    it("is deterministic for the same input", async () => {
        expect(await hashString("elixpo-test-input")).toBe(
            await hashString("elixpo-test-input"),
        );
    });

    it("differs for different inputs", async () => {
        expect(await hashString("a")).not.toBe(await hashString("b"));
    });

    it("returns a 64-char SHA-256 hex digest", async () => {
        const h = await hashString("hello world");
        expect(h).toHaveLength(64);
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("generatePKCE", () => {
    it("returns a verifier and a base64url-encoded challenge", async () => {
        const { verifier, challenge } = await generatePKCE();
        expect(verifier).toMatch(/^[0-9a-f]+$/);
        expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(challenge).not.toContain("=");
    });

    it("derives a different challenge from a different verifier", async () => {
        const a = await generatePKCE();
        const b = await generatePKCE();
        expect(a.verifier).not.toBe(b.verifier);
        expect(a.challenge).not.toBe(b.challenge);
    });
});
