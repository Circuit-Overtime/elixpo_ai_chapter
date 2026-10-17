import { describe, expect, it } from "vitest";
import {
    highImpactScopes,
    isHighImpactScope,
    isLixBlogsScope,
    LIXBLOGS_SCOPE_DETAILS,
    SUPPORTED_LIXBLOGS_SCOPES,
    unsupportedLixBlogsScopes,
} from "../lixblogs-scopes";

describe("LixBlogs scope registry", () => {
    it("exposes every registry key through SUPPORTED_LIXBLOGS_SCOPES", () => {
        expect(SUPPORTED_LIXBLOGS_SCOPES).toEqual(
            Object.keys(LIXBLOGS_SCOPE_DETAILS),
        );
    });

    it("recognizes registered scopes and rejects unknown ones", () => {
        expect(isLixBlogsScope("lixblogs:blog:read")).toBe(true);
        expect(isLixBlogsScope("lixblogs:blog:nonexistent")).toBe(false);
        expect(isLixBlogsScope("openid")).toBe(false);
    });

    it("flags publish, permanent delete, and account delete as high impact", () => {
        expect(isHighImpactScope("lixblogs:blog:publish")).toBe(true);
        expect(isHighImpactScope("lixblogs:blog:delete")).toBe(true);
        expect(isHighImpactScope("lixblogs:account:delete")).toBe(true);
        expect(
            isHighImpactScope("lixblogs:integrations:cloudinary:disconnect"),
        ).toBe(true);
    });

    it("does not flag ordinary read/write scopes as high impact", () => {
        expect(isHighImpactScope("lixblogs:blog:read")).toBe(false);
        expect(isHighImpactScope("lixblogs:blog:write")).toBe(false);
        expect(isHighImpactScope("lixblogs:profile:write")).toBe(false);
        expect(isHighImpactScope("lixblogs:integrations:cloudinary:read")).toBe(
            false,
        );
    });

    it("filters a scope list down to only the high-impact members", () => {
        expect(
            highImpactScopes([
                "lixblogs:blog:read",
                "lixblogs:blog:publish",
                "lixblogs:account:delete",
                "lixblogs:media:read",
            ]),
        ).toEqual(["lixblogs:blog:publish", "lixblogs:account:delete"]);
    });

    it("reports scopes not defined in the registry", () => {
        expect(
            unsupportedLixBlogsScopes([
                "lixblogs:blog:read",
                "lixblogs:not:real",
                "openid",
            ]),
        ).toEqual(["lixblogs:not:real", "openid"]);
    });

    it("every registry entry has a non-empty label and description", () => {
        for (const scope of SUPPORTED_LIXBLOGS_SCOPES) {
            const detail = LIXBLOGS_SCOPE_DETAILS[scope];
            expect(detail.label.length).toBeGreaterThan(0);
            expect(detail.description.length).toBeGreaterThan(0);
            expect(typeof detail.highImpact).toBe("boolean");
        }
    });
});
