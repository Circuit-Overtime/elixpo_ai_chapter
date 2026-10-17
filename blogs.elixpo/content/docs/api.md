# API automation

The LixBlogs API lets scripts, CI jobs, and external tools perform the same content operations as the CLI. Create a personal access token in **Settings → API**, then send it as a bearer credential to the versioned API at `https://blogs.elixpo.com/api/v1`.

## Create a token

Choose a descriptive name, an expiry, an account boundary, and only the scopes the automation needs. A token can represent either:

- your personal LixBlogs account; or
- one organization in which you are currently a member.

The complete token is displayed once. LixBlogs stores a SHA-256 digest, not the token itself. Put the value in a secret manager rather than a repository, log, URL, or browser bundle.

Each user can keep up to 10 active tokens across personal and organization boundaries. Expired and revoked tokens do not count toward this limit.

```bash
export LIXBLOGS_TOKEN="lix_pat_..."
curl --fail-with-body https://blogs.elixpo.com/api/v1/me \
  -H "Authorization: Bearer $LIXBLOGS_TOKEN"
```

Token scopes do not increase the creator's permissions. Every request is also checked against the current account, organization membership, collaborator role, plan limits, and resource boundary. Removing a user from an organization immediately makes that organization's tokens unusable.

## Common scopes

| Scope | Allows |
| --- | --- |
| `lixblogs:profile:read` | Read the authenticated profile |
| `lixblogs:blog:read` | List blogs, read content, and inspect history |
| `lixblogs:blog:write` | Create and revise drafts, including their secret-author setting |
| `lixblogs:blog:publish` | Publish, unlist, or unpublish blogs |
| `lixblogs:blog:delete` | Move owned blogs to trash and restore them |
| `lixblogs:media:read` | Read tracked media metadata |
| `lixblogs:media:write` | Upload, generate, attach, or remove media |
| `lixblogs:collaboration:read` | Read collaborators and invitations |
| `lixblogs:collaboration:write` | Manage collaborators within the granted boundary |
| `lixblogs:organizations:read` | Read an authorized organization and its collections |
| `lixblogs:analytics:read` | Read aggregate creator analytics |

## Create a draft

Mutating requests that may be retried require a unique `Idempotency-Key`. Reusing a key with the same request returns the original result; reusing it with different input is rejected.

```bash
curl --fail-with-body https://blogs.elixpo.com/api/v1/blogs \
  -X POST \
  -H "Authorization: Bearer $LIXBLOGS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: draft-$(date +%s)" \
  --data '{
    "title": "Automated, but reviewed",
    "subtitle": "A draft created through the API",
    "tags": ["automation", "publishing"],
    "publishedAs": "personal",
    "content": [{"id":"intro","type":"paragraph","content":[{"type":"text","text":"Start with a draft, review it, and publish explicitly.","styles":{}}]}]
  }'
```

For an organization token, use `"publishedAs":"org:ORG_ID"`. A personal token cannot cross into an organization, and an organization token cannot access personal resources or another organization.

## Read, revise, and publish safely

Blog responses include an `ETag`. Send the latest value with `If-Match` when changing content or publication state. If another editor changed the blog first, the API returns `412` with the current ETag rather than overwriting their work.

```bash
curl -i https://blogs.elixpo.com/api/v1/blogs/BLOG_ID \
  -H "Authorization: Bearer $LIXBLOGS_TOKEN"

curl --fail-with-body https://blogs.elixpo.com/api/v1/blogs/BLOG_ID \
  -X PATCH \
  -H "Authorization: Bearer $LIXBLOGS_TOKEN" \
  -H 'If-Match: "ETAG_FROM_READ"' \
  -H "Content-Type: application/json" \
  --data '{"tags":["automation","api"]}'

curl --fail-with-body https://blogs.elixpo.com/api/v1/blogs/BLOG_ID/publish \
  -X POST \
  -H "Authorization: Bearer $LIXBLOGS_TOKEN" \
  -H 'If-Match: "LATEST_ETAG"' \
  -H "Idempotency-Key: publish-BLOG_ID-1" \
  -H "Content-Type: application/json" \
  --data '{"status":"published"}'
```

Publishing is always a separate operation. Creating or editing a draft never makes it public implicitly.

Set `"secret":true` while creating or revising a draft to publish without the
author's identity. This uses `lixblogs:blog:write`; it does not require a broader
identity scope. Secret mode is anonymous publishing, not access control: the
short-ID story URL remains public, while author routes, profiles, recommendations,
digests, sitemap entries, and search author qualifiers cannot connect it to its
writer. The setting is locked after the story is first published.

## Media, comments, and collaboration

The API also exposes the workflows used by the CLI:

- `POST /api/v1/media/upload` for compressed cover or inline media;
- `POST /api/v1/media/generate` for an image using the creator's connected Pollinations account;
- `GET|POST /api/v1/blogs/{id}/comments` and `DELETE /api/v1/blogs/{id}/comments/{commentId}`;
- `GET|POST|PATCH|DELETE /api/v1/blogs/{id}/collaborators`;
- `GET|POST /api/v1/collaboration/invitations`;
- `GET /api/v1/analytics` for aggregate creator metrics.

Media continues through the normal optimization, storage quota, provider selection, ownership, and deletion pipeline. Provider credentials are never returned to API clients.

## Curated collections

Personal tokens can automate collection curation with the existing blog scopes:

- `GET|POST /api/v1/collections` lists or creates collections;
- `GET|PATCH|DELETE /api/v1/collections/{id}` reads, edits, or deletes one collection; and
- `GET|POST|DELETE /api/v1/collections/{id}/entries` lists, adds, or removes referenced public blogs.

Reads require `lixblogs:blog:read`; mutations require `lixblogs:blog:write`. An entry stores the blog reference, ordering, category, and optional curator note. The response resolves the original author, canonical URL, and author-selected license from the source blog. Organization-scoped tokens cannot manage personal collections.

Adding a post fails when it is not public, is secret, has been deleted, or its author has disabled third-party curation. Authors may remove their own work from another user's collection through the signed-in web interface.

## Writing contests

Contest automation uses the existing blog scopes:

- `GET|POST /api/v1/contests` discovers or creates contests;
- `GET|PATCH|DELETE /api/v1/contests/{id}` inspects or manages a contest; deletion is limited to organizer-owned private drafts;
- `GET|POST|DELETE /api/v1/contests/{id}/submissions` lists, submits, or withdraws entries;
- `GET|POST|DELETE /api/v1/contests/{id}/members` manages moderator and judge roles; and
- `POST /api/v1/contests/{id}/results` assigns and finalizes placements.

Submission reads and discovery require `lixblogs:blog:read`; creation, roles, and entries require `lixblogs:blog:write`; final results require `lixblogs:blog:publish`. Snapshot content is returned only with `?snapshot=true` and only to the organizer or an assigned judge. A submitted blog remains owned by its author and the API stores an immutable judging snapshot.

## Responses and operational safety

Successful responses use the stable `data` envelope. Errors include a machine-readable `code`, message, and request ID. Pagination uses opaque cursors. Rate-limit headers report the active window; automation should honor `429` and `Retry-After` rather than retrying immediately.

Use a separate token per workflow. Rotate a token by creating its replacement, updating the consuming secret, confirming the new credential works, and revoking the old token in **Settings → API**. Revocation takes effect on the next request because PAT authentication reads the token record for every request rather than caching authorization. API audit records identify the token used without recording its secret.

For interactive or multi-user applications, use the Accounts OAuth flow instead of asking users to paste personal access tokens. For local agent workflows, the [LixBlogs CLI](/docs/cli) remains the simplest interface and preserves the same scopes, ETags, idempotency, and confirmation rules.
