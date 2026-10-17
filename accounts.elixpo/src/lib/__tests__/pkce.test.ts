import { describe, expect, it } from "vitest";
import {
    constantTimeEqual,
    deriveS256CodeChallenge,
    isValidPkceValue,
    verifyS256CodeChallenge,
} from "../pkce";

describe("authorization-code PKCE", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    it("matches the RFC 7636 S256 vector", async () => {
        expect(await deriveS256CodeChallenge(verifier)).toBe(challenge);
        expect(await verifyS256CodeChallenge(verifier, challenge)).toBe(true);
    });

    it("rejects malformed and mismatched values", async () => {
        expect(isValidPkceValue("short")).toBe(false);
        expect(await verifyS256CodeChallenge(verifier, `${challenge}x`)).toBe(
            false,
        );
        expect(constantTimeEqual("same", "same")).toBe(true);
        expect(constantTimeEqual("same", "different")).toBe(false);
    });
});
