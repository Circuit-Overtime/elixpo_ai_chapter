import { describe, expect, it } from "vitest";
import { normalizeOAuthAudience } from "../oauth-client-registration";

describe("public OAuth client audience", () => {
    it("accepts a normalized host and optional port", () => {
        expect(normalizeOAuthAudience(" Blogs.Elixpo.com ")).toBe(
            "blogs.elixpo.com",
        );
        expect(normalizeOAuthAudience("localhost:3000")).toBe("localhost:3000");
    });

    it("rejects schemes, paths, and credentials", () => {
        expect(normalizeOAuthAudience("https://blogs.elixpo.com")).toBeNull();
        expect(normalizeOAuthAudience("blogs.elixpo.com/api")).toBeNull();
        expect(normalizeOAuthAudience("user@blogs.elixpo.com")).toBeNull();
    });
});
