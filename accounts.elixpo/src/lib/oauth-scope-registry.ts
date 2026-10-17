import { LIXBLOGS_SCOPE_DETAILS } from "./lixblogs-scopes";
import { LIXRL_SCOPE_DETAILS } from "./oauth-config";
import { OAUTH_SCOPE_DETAILS } from "./oauth-scopes";

export interface CustomOAuthScope {
    name: string;
    label: string;
    description: string;
}

export interface OAuthScopeOption extends CustomOAuthScope {
    group: "standard" | "product" | "custom" | "unavailable";
    highImpact?: boolean;
}

const STANDARD_OPTIONS: OAuthScopeOption[] = Object.entries(
    OAUTH_SCOPE_DETAILS,
).map(([name, detail]) => ({ name, ...detail, group: "standard" }));

const PRODUCT_OPTIONS: OAuthScopeOption[] = Object.entries({
    ...LIXBLOGS_SCOPE_DETAILS,
    ...LIXRL_SCOPE_DETAILS,
}).map(([name, detail]) => ({ name, ...detail, group: "product" }));

export const BUILT_IN_SCOPE_OPTIONS = [
    ...STANDARD_OPTIONS,
    ...PRODUCT_OPTIONS,
] as const;

export const SUPPORTED_PRODUCT_SCOPES = PRODUCT_OPTIONS.map(
    (scope) => scope.name,
);

const BUILT_IN_NAMES = new Set(
    BUILT_IN_SCOPE_OPTIONS.map((scope) => scope.name),
);
const SCOPE_NAME_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,79}$/;

export function parseCustomScopes(value: unknown): CustomOAuthScope[] {
    if (typeof value === "string") {
        try {
            return parseCustomScopes(JSON.parse(value));
        } catch {
            return [];
        }
    }
    if (!Array.isArray(value)) return [];
    return value.filter(
        (item): item is CustomOAuthScope =>
            !!item &&
            typeof item === "object" &&
            typeof item.name === "string" &&
            typeof item.label === "string" &&
            typeof item.description === "string",
    );
}

export function validateCustomScopes(
    value: unknown,
): { scopes: CustomOAuthScope[] } | { error: string } {
    if (value === undefined) return { scopes: [] };
    if (!Array.isArray(value))
        return { error: "custom_scopes must be an array" };
    if (value.length > 20)
        return { error: "Maximum of 20 custom scopes allowed" };

    const scopes: CustomOAuthScope[] = [];
    const names = new Set<string>();
    for (const item of value) {
        if (!item || typeof item !== "object") {
            return { error: "Each custom scope must be an object" };
        }
        const candidate = item as Record<string, unknown>;
        const name =
            typeof candidate.name === "string" ? candidate.name.trim() : "";
        const label =
            typeof candidate.label === "string" ? candidate.label.trim() : "";
        const description =
            typeof candidate.description === "string"
                ? candidate.description.trim()
                : "";
        if (!SCOPE_NAME_PATTERN.test(name)) {
            return {
                error: "Custom scope names must be 2-80 lowercase characters using letters, numbers, dots, underscores, colons, or hyphens",
            };
        }
        if (BUILT_IN_NAMES.has(name)) {
            return {
                error: `Custom scope conflicts with built-in scope: ${name}`,
            };
        }
        if (names.has(name))
            return { error: `Duplicate custom scope: ${name}` };
        if (
            !label ||
            label.length > 80 ||
            !description ||
            description.length > 240
        ) {
            return {
                error: "Custom scopes require a label up to 80 characters and description up to 240 characters",
            };
        }
        names.add(name);
        scopes.push({ name, label, description });
    }
    return { scopes };
}

export function scopeOptionsForClient(
    customScopes: CustomOAuthScope[],
    selectedScopes: string[] = [],
): OAuthScopeOption[] {
    const options: OAuthScopeOption[] = [
        ...BUILT_IN_SCOPE_OPTIONS,
        ...customScopes.map((scope) => ({
            ...scope,
            group: "custom" as const,
        })),
    ];
    const known = new Set(options.map((scope) => scope.name));
    for (const name of selectedScopes) {
        if (!known.has(name)) {
            options.push({
                name,
                label: name,
                description:
                    "This selected scope is no longer available. Remove it explicitly to continue without it.",
                group: "unavailable",
            });
        }
    }
    return options;
}

export function filterScopeOptions(
    options: OAuthScopeOption[],
    query: string,
    selectedScopes: string[] = [],
): OAuthScopeOption[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter(
        (scope) =>
            selectedScopes.includes(scope.name) ||
            [scope.name, scope.label, scope.description].some((value) =>
                value.toLowerCase().includes(normalized),
            ),
    );
}

export function findScopeOption(
    name: string,
    customScopes: CustomOAuthScope[] = [],
): OAuthScopeOption | undefined {
    return scopeOptionsForClient(customScopes).find(
        (scope) => scope.name === name,
    );
}
