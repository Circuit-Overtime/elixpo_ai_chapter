# LixBlogs API v1 contract

The CLI is a public OAuth client. Accounts issues credentials; LixBlogs is the
resource server. The CLI must never connect to D1 or carry a client secret.

## Origins and discovery

- OAuth issuer: `https://accounts.elixpo.com`
- Token audience: `blogs.elixpo.com`
- Resource root: `https://blogs.elixpo.com/api/v1`
- Contract metadata: `GET /api/v1`

Production bearer tokens are EdDSA access tokens issued to an allowlisted CLI
client. LixBlogs verifies their signature, expiry, audience, client, scopes,
and local account before querying creator data. Tokens are never persisted or
logged by the resource API.

## Initial resources

| Method | Path | Scope | Behavior |
| --- | --- | --- | --- |
| `GET` | `/api/v1` | public | API and compatibility metadata |
| `GET` | `/api/v1/me` | `lixblogs:profile:read` | Current LixBlogs identity |
| `PATCH` | `/api/v1/me` | `lixblogs:profile:write` | Update the current profile designation |
| `GET` | `/api/v1/blogs` | `lixblogs:blog:read` | Accessible blog metadata |
| `GET` | `/api/v1/blogs/{id}` | `lixblogs:blog:read` | One accessible blog and its content |
| `POST` | `/api/v1/blogs` | `lixblogs:blog:write` | Create a draft, including secret-author mode |
| `PATCH` | `/api/v1/blogs/{id}` | `lixblogs:blog:write` | Edit a draft or post; secret mode is draft-only |
| `POST` | `/api/v1/blogs/{id}/publish` | `lixblogs:blog:publish` | Publish a post |
| `POST` | `/api/v1/blogs/{id}/unpublish` | `lixblogs:blog:publish` | Return a post to draft |
| `DELETE` | `/api/v1/blogs/{id}` | `lixblogs:blog:delete` | Move a post to trash |
| `POST` | `/api/v1/blogs/{id}/restore` | `lixblogs:blog:delete` | Restore a trashed post |
| `GET`, `POST` | `/api/v1/collections` | `lixblogs:blog:read`, `lixblogs:blog:write` | List or create personal curated collections |
| `GET`, `PATCH`, `DELETE` | `/api/v1/collections/{id}` | `lixblogs:blog:read`, `lixblogs:blog:write` | Inspect, edit, or delete an owned collection |
| `GET`, `POST`, `DELETE` | `/api/v1/collections/{id}/entries` | `lixblogs:blog:read`, `lixblogs:blog:write` | List, add, or remove canonical public-blog references |
| `GET`, `POST` | `/api/v1/contests` | `lixblogs:blog:read`, `lixblogs:blog:write` | Discover or create contests |
| `GET`, `PATCH`, `DELETE` | `/api/v1/contests/{id}` | `lixblogs:blog:read`, `lixblogs:blog:write`, `lixblogs:blog:delete` | Inspect or manage a contest lifecycle; delete private drafts |
| `GET`, `POST`, `DELETE` | `/api/v1/contests/{id}/submissions` | `lixblogs:blog:read`, `lixblogs:blog:write` | Review, submit, or withdraw immutable entries |
| `GET`, `POST`, `DELETE` | `/api/v1/contests/{id}/members` | `lixblogs:blog:read`, `lixblogs:blog:write` | Manage moderator and judge roles |
| `POST` | `/api/v1/contests/{id}/results` | `lixblogs:blog:publish` | Save or finalize placements |
| `GET` | `/api/v1/orgs` | `lixblogs:organizations:read` | Organizations the caller belongs to |
| `GET` | `/api/v1/orgs/{id}` | `lixblogs:organizations:read` | One caller-visible organization and role |
| `GET` | `/api/v1/orgs/{id}/collections` | `lixblogs:organizations:read` | Collections within a caller membership |
| `GET` | `/api/v1/orgs/{id}/members` | `lixblogs:organizations:read` | Members and roles within a caller membership |
| `GET` | `/api/v1/blogs/{id}/collaborators` | `lixblogs:collaboration:read` | Editorial team and effective role |
| `POST` | `/api/v1/blogs/{id}/collaborators` | `lixblogs:collaboration:write` | Invite or reassign a collaborator |
| `PATCH` | `/api/v1/blogs/{id}/collaborators` | `lixblogs:collaboration:write` | Change a collaborator role |
| `DELETE` | `/api/v1/blogs/{id}/collaborators` | `lixblogs:collaboration:write` | Remove a collaborator or leave a team |
| `GET` | `/api/v1/collaboration/invitations` | `lixblogs:collaboration:read` | Current identity's invitations |
| `POST` | `/api/v1/collaboration/invitations` | `lixblogs:collaboration:write` | Accept or decline an invitation |
| `GET` | `/api/v1/analytics` | `lixblogs:analytics:read` | Bounded creator analytics dimensions |
| `GET`, `POST` | `/api/v1/blogs/{id}/versions` | `lixblogs:blog:read`, `lixblogs:blog:write` | List or restore retained versions |
| `GET`, `POST` | `/api/v1/blogs/{id}/comments` | `lixblogs:blog:read`, `lixblogs:blog:write` | List, comment, or reply |
| `DELETE` | `/api/v1/blogs/{id}/comments/{commentId}` | `lixblogs:blog:write` | Delete an owned comment or moderate an authored blog |
| `GET`, `DELETE` | `/api/v1/integrations/pollinations` | `lixblogs:media:read`, `lixblogs:media:write` | Inspect or disconnect the caller's BYOP connection |
| `POST` | `/api/v1/media/generate` | `lixblogs:media:write` | Generate one image using the caller's connected Pollinations budget |
| `POST` | `/api/v1/media/upload` | `lixblogs:media:write` | Send an image through the canonical storage pipeline |
| `DELETE` | `/api/v1/media/{id}` | `lixblogs:media:write` | Delete an owned tracked asset from its storage provider |

`GET /api/v1/blogs/{id}/versions` returns retained snapshot summaries. Add
`?version={versionId}` to retrieve one snapshot's full block content before a
restore. Restoration remains a conditional write using `If-Match`.

`GET /api/v1/analytics` accepts `scope=personal|org:<id>`, `range=7d|30d|90d|12m|custom`,
`from`, `to`, `dimension=overview|timeline|posts|sources|devices|countries`, `limit=1..100`,
and an opaque `cursor`. Organization queries additionally require `lixblogs:organizations:read`
and an owner, admin, or maintain membership. Responses contain aggregate creator data;
visitor identifiers are never returned.

`GET /api/v1/blogs` accepts `status=all|draft|published`, `limit=1..100`, and
an opaque `cursor`. Results include authored blogs, accepted collaborations,
and blogs belonging to organizations of which the caller is a member. Access
misses return `404` so resource existence is not disclosed.

`secret: true` means anonymous public publishing, not reader access control.
The API and CLI use `lixblogs:blog:write` to set it on a draft. After first
publication it cannot be changed. Public author surfaces and recommendations
must not reveal or allow inference of the writer.

Permanent deletion uses `DELETE /api/v1/blogs/{id}?permanent=true`. It requires
the additional `lixblogs:blog:delete:permanent` scope and an
`X-Confirm-Permanent-Delete` header equal to the blog ID.

## Response shape

Successful responses use:

```json
{ "data": {}, "meta": {} }
```

Errors use a stable machine-readable envelope:

```json
{
  "error": {
    "code": "invalid_token",
    "message": "The access token is malformed.",
    "requestId": "..."
  }
}
```

Every response carries `X-LixBlogs-API-Version` and `X-Request-ID`. Authenticated
responses also expose bounded per-minute `X-RateLimit-*` values. Clients should
use error codes rather than matching human-readable messages.

## Concurrency and retries

Single-blog reads include a strong `ETag`. Future write endpoints require
`If-Match` so a stale CLI cannot silently overwrite a newer browser edit.

Mutation requests use an `Idempotency-Key` containing 8–128 URL-safe
characters. Reservations live for 24 hours:

- same key and same request: replay the retained response;
- same key while running: `idempotency_in_progress`;
- same key with different input: `idempotency_key_reused`.

Operational rows are pruned in bounded batches. Audit events record the caller,
client, action, resource, outcome, and request ID, never bearer material.

## Compatibility policy

The `/api/v1` URL and envelope are stable for the v1 lifetime. Fields may be
added without a major version change; existing fields and error codes are not
removed or redefined. A breaking change requires `/api/v2`. The metadata
endpoint advertises `minCliVersion`; clients below it must stop before making
authenticated requests and present an upgrade instruction.
