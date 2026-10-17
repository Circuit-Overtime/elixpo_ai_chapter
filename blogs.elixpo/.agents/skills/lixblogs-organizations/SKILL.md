---
name: lixblogs-organizations
description: Inspect LixBlogs organization memberships, roles, collections, and valid publication targets through the supported CLI. Use when an agent must choose or verify a personal, organization, or collection target without crossing tenant boundaries.
---

# LixBlogs organizations

Use `@elixpo/lixblogs-cli` 1.2.0 or newer and add `--json --no-input` for automation. Use only CLI commands; never access D1, cookies, passwords, tokens, or endpoints directly.

## Access

This read-only workflow requires `lixblogs:organizations:read`. It does not authorize organization changes or publication. Verify the active identity and scope first:

```bash
lixblogs whoami --json --no-input
lixblogs org list --json --no-input
```

## Resolve a target

1. Use `org list` to obtain authenticated memberships and effective roles.
2. Use the returned organization ID—not an unverified slug—to inspect it.
3. Use `org targets` for writable publication targets. It excludes read-only memberships.
4. If a collection is requested, select its ID only from the target's returned collection list.
5. Present the chosen tenant, role, and collection to the user before passing `--publication org:ORG_ID` or `--collection COLLECTION_ID` to an authoring command.

```bash
lixblogs org get ORG_ID --json --no-input
lixblogs org collections ORG_ID --json --no-input
lixblogs org members ORG_ID --json --no-input
lixblogs org targets --json --no-input
```

Roles `admin`, `maintain`, and `write` may appear as writable. `read` is inspection-only. Never infer access from a public organization page, a slug, a previous run, or user-supplied metadata; the current CLI response is authoritative.

## Safety and recovery

- `org_not_found` also represents inaccessible tenants. Do not probe alternate identifiers.
- `insufficient_scope`: request only `lixblogs:organizations:read`.
- A missing target means the current identity cannot publish there; stop instead of falling back to a similarly named organization.
- Re-run `org targets` immediately before a draft changes publication tenant because memberships and roles can change.
- Report request IDs for diagnosis without printing credentials.

Use `lixblogs-author` to draft after target selection and `lixblogs-publish` for a separately approved public-state change.
