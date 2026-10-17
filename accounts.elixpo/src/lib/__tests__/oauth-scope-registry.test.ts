import { describe, expect, it } from "vitest";
import { createAuthorizationServerMetadata } from "../oauth-metadata";
import {
    filterScopeOptions,
    findScopeOption,
    scopeOptionsForClient,
    validateCustomScopes,
} from "../oauth-scope-registry";

describe("OAuth scope registry", () => {
    it("publishes the Lixrl bootstrap permission in plain language", () => {
        const scope = findScopeOption("lixrl:keys:create");
        expect(scope).toMatchObject({
            group: "product",
            highImpact: true,
        });
        expect(scope?.description).toContain("one scoped Lixrl API key");
        expect(scope?.description).toContain("does not grant direct access");
        expect(createAuthorizationServerMetadata().scopes_supported).toContain(
            "lixrl:keys:create",
        );
    });

    it("validates app-defined scopes without allowing built-in collisions", () => {
        expect(
            validateCustomScopes([
                {
                    name: "acme:documents:read",
                    label: "Read documents",
                    description: "View documents stored in Acme.",
                },
            ]).scopes,
        ).toHaveLength(1);
        expect(
            validateCustomScopes([
                {
                    name: "email",
                    label: "Override email",
                    description: "Invalid built-in collision.",
                },
            ]).error,
        ).toContain("conflicts with built-in");
    });

    it("searches names, labels, and descriptions while retaining selections", () => {
        const options = scopeOptionsForClient(
            [
                {
                    name: "acme:documents:read",
                    label: "Read documents",
                    description: "View files stored in Acme.",
                },
            ],
            ["email"],
        );
        expect(
            filterScopeOptions(options, "documents").map((item) => item.name),
        ).toContain("acme:documents:read");
        expect(
            filterScopeOptions(options, "stored in acme").map(
                (item) => item.name,
            ),
        ).toContain("acme:documents:read");
        expect(
            filterScopeOptions(options, "no match", ["email"]).map(
                (item) => item.name,
            ),
        ).toEqual(["email"]);
    });

    it("keeps unavailable selected scopes visible", () => {
        const options = scopeOptionsForClient([], ["legacy:scope"]);
        expect(options.at(-1)).toMatchObject({
            name: "legacy:scope",
            group: "unavailable",
        });
    });
});
