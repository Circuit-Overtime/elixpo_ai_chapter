/**
 * LixBlogs scope registry.
 *
 * Separate from `oauth-scopes.ts` on purpose: `OAUTH_SCOPE_DETAILS` there is
 * the core identity registry backing the browser `/api/auth/me` response
 * (openid/profile/email) and is asserted exhaustively by
 * `oauth-scopes.test.ts`. These are resource scopes for the LixBlogs API,
 * requested by public CLI/device clients (elixpo/blogs.elixpo#135) — a
 * different surface, a different lifecycle, namespaced so they can never
 * collide with a future core scope.
 *
 * Least-privilege: read/write are split per resource wherever the resource
 * supports mutation, so a client only has to ask for what it needs.
 * `highImpact: true` marks scopes that must be called out explicitly during
 * consent (accounts.elixpo#73: "publish, permanent delete, and account
 * delete must be clearly identified during consent") — the verification-page
 * UI (tracked separately) is expected to render these with extra emphasis.
 */

export interface LixBlogsScopeDetail {
    label: string;
    description: string;
    /** Must be surfaced with extra emphasis during consent. */
    highImpact: boolean;
}

export const LIXBLOGS_SCOPE_DETAILS = {
    "lixblogs:profile:read": {
        label: "Read your LixBlogs profile",
        description: "View your LixBlogs display name, handle, and bio.",
        highImpact: false,
    },
    "lixblogs:profile:write": {
        label: "Edit your LixBlogs profile",
        description: "Update your LixBlogs display name, handle, and bio.",
        highImpact: false,
    },
    "lixblogs:blog:read": {
        label: "Read your blogs",
        description: "View your blog posts, including drafts.",
        highImpact: false,
    },
    "lixblogs:blog:write": {
        label: "Create and edit blogs",
        description: "Create new posts and edit existing drafts.",
        highImpact: false,
    },
    "lixblogs:blog:publish": {
        label: "Publish blogs",
        description: "Make a draft publicly visible.",
        highImpact: true,
    },
    "lixblogs:integrations:cloudinary:read": {
        label: "Read your Cloudinary connection",
        description:
            "Check whether a personal Cloudinary account is connected for storing media.",
        highImpact: false,
    },
    "lixblogs:integrations:cloudinary:disconnect": {
        label: "Disconnect Cloudinary",
        description:
            "Remove your personal Cloudinary connection. Media already stored there is not deleted, but new uploads will use LixBlogs' default storage instead.",
        highImpact: true,
    },
    "lixblogs:blog:delete": {
        label: "Permanently delete blogs",
        description: "Permanently remove a blog post. This cannot be undone.",
        highImpact: true,
    },
    "lixblogs:media:read": {
        label: "View media",
        description: "View images and files uploaded to your LixBlogs account.",
        highImpact: false,
    },
    "lixblogs:media:write": {
        label: "Upload media",
        description: "Upload and attach images and files to your posts.",
        highImpact: false,
    },
    "lixblogs:organizations:read": {
        label: "View organizations",
        description: "View organizations you belong to and their members.",
        highImpact: false,
    },
    "lixblogs:organizations:write": {
        label: "Manage organizations",
        description: "Update organization settings and membership.",
        highImpact: false,
    },
    "lixblogs:collaboration:read": {
        label: "View collaborators",
        description: "View collaborators and pending invites on your blogs.",
        highImpact: false,
    },
    "lixblogs:collaboration:write": {
        label: "Manage collaborators",
        description: "Invite, remove, or change collaborator permissions.",
        highImpact: false,
    },
    "lixblogs:analytics:read": {
        label: "View analytics",
        description: "View view counts and traffic analytics for your blogs.",
        highImpact: false,
    },
    "lixblogs:notifications:read": {
        label: "View notifications",
        description: "View your LixBlogs notifications.",
        highImpact: false,
    },
    "lixblogs:account:delete": {
        label: "Delete your account",
        description:
            "Permanently delete your LixBlogs account and all associated content. This cannot be undone.",
        highImpact: true,
    },
} as const;

export type LixBlogsScope = keyof typeof LIXBLOGS_SCOPE_DETAILS;

export const SUPPORTED_LIXBLOGS_SCOPES = Object.keys(
    LIXBLOGS_SCOPE_DETAILS,
) as LixBlogsScope[];

export function isLixBlogsScope(scope: string): scope is LixBlogsScope {
    return Object.hasOwn(LIXBLOGS_SCOPE_DETAILS, scope);
}

export function isHighImpactScope(scope: string): boolean {
    return isLixBlogsScope(scope) && LIXBLOGS_SCOPE_DETAILS[scope].highImpact;
}

export function highImpactScopes(scopes: string[]): string[] {
    return scopes.filter((scope) => isHighImpactScope(scope));
}

/** Scopes in `scopes` that neither the core registry nor this one define. */
export function unsupportedLixBlogsScopes(scopes: string[]): string[] {
    return scopes.filter((scope) => !isLixBlogsScope(scope));
}
