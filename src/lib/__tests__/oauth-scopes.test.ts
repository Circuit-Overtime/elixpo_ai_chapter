import { describe, expect, it } from "vitest";
import {
    parseOAuthScopes,
    SUPPORTED_OAUTH_SCOPES,
    unsupportedOAuthScopes,
} from "../oauth-scopes";

describe("OAuth scopes", () => {
    it("normalizes whitespace and removes duplicates", () => {
        expect(parseOAuthScopes("openid  profile\nemail profile")).toEqual([
            "openid",
            "profile",
            "email",
        ]);
    });

    it("reports scopes that do not have implemented claims", () => {
        expect(unsupportedOAuthScopes(["openid", "phone", "address"])).toEqual([
            "phone",
            "address",
        ]);
    });

    it("only exposes scopes backed by the user-info response", () => {
        expect(SUPPORTED_OAUTH_SCOPES).toEqual(["openid", "profile", "email"]);
    });
});
