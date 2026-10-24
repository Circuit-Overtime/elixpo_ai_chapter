import { describe, expect, it } from "vitest";
import {
    BRANDING_REQUIRED_AFTER_SIGN_INS,
    requiresBrandingVerification,
} from "../branding-gate";

describe("branding verification threshold", () => {
    it("allows the first 21 sign-ins before requiring verification", () => {
        expect(
            requiresBrandingVerification(
                BRANDING_REQUIRED_AFTER_SIGN_INS,
                false,
            ),
        ).toBe(false);
    });

    it("requires verification above the threshold", () => {
        expect(
            requiresBrandingVerification(
                BRANDING_REQUIRED_AFTER_SIGN_INS + 1,
                false,
            ),
        ).toBe(true);
    });

    it("does not block a verified app", () => {
        expect(requiresBrandingVerification(10_000, true)).toBe(false);
    });

    it("does not block a platform-owned app", () => {
        expect(requiresBrandingVerification(10_000, false, true)).toBe(false);
    });
});
