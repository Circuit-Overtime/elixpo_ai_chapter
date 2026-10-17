---
name: lixblogs-editorial
description: Manage LixBlogs collaborators, invitations, review roles, and editorial permissions through the supported CLI. Use when an agent must inspect a blog team, invite a reviewer or editor, change a role, resolve an invitation, or explain deferred collaboration notifications.
---

# LixBlogs editorial

Use `@elixpo/lixblogs-cli` 1.2.0 or newer. Automation must include `--json --no-input`. Never use D1, browser cookies, passwords, raw credentials, or direct API calls.

## Authority model

- `viewer`: review/read authority only; cannot edit or publish.
- `editor`: may edit after accepting. Publishing still requires the separate publish OAuth scope and an explicit publishing decision.
- `admin`: may edit and manage collaborators after accepting. Publishing remains a separate operation.
- Blog owner and eligible organization managers may manage the team.

Read workflows require `lixblogs:collaboration:read`. Invitations, role changes, acceptance, decline, and removal require `lixblogs:collaboration:write`. Do not request `lixblogs:blog:publish` unless the user separately asks to publish.

## Inspect

```bash
lixblogs whoami --json --no-input
lixblogs collab list BLOG_ID --json --no-input
lixblogs collab invitations --json --no-input
```

Invitation output reports `notificationState`. `deferred_until_publish` means the draft invitation exists but its user notification is intentionally withheld until the blog has a published reader URL.

## Mutations

State the target user, blog, role, and consequence. Obtain explicit approval before passing `--yes`. Run `--dry-run` first.

```bash
lixblogs collab invite BLOG_ID --user USERNAME --role viewer --dry-run --json --no-input
lixblogs collab invite BLOG_ID --user USERNAME --role viewer --yes --json --no-input
lixblogs collab role BLOG_ID --user USERNAME_OR_ID --role editor --yes --json --no-input
lixblogs collab remove BLOG_ID --user USERNAME_OR_ID --yes --json --no-input
lixblogs collab accept BLOG_ID --yes --json --no-input
lixblogs collab accept BLOG_ID --hide-on-profile --yes --json --no-input
lixblogs collab decline BLOG_ID --yes --json --no-input
```

Omitting `--user` from `collab remove` removes the current identity from that blog. Never interpret a review request as permission to grant editor/admin access, accept an invitation, publish, or remove someone.

## Recovery

- Exit `5`: approval is missing. Ask rather than retrying.
- `role_forbidden`: report the current role and stop; do not probe another tenant or identity.
- `collaborator_limit_reached`: do not remove someone automatically to make space.
- `invitation_not_found`: refresh `collab invitations`; it may have been resolved elsewhere.
- Authentication/scope failure: request only the reported collaboration scope.
- Include request IDs in failure reports and never expose credentials.

Use `lixblogs-author` for draft content and `lixblogs-publish` only after separate publication approval.
