# LixBlogs CLI

`@elixpo/lixblogs-cli` is the supported command-line client for creators and automation. It uses Accounts device authorization and the versioned LixBlogs API. It never needs a password, browser session cookie, D1 binding, or application secret.

## Install

```bash
npm install --global @elixpo/lixblogs-cli
lixblogs --help
```

Node.js 18 or newer is required.

## Sign in

```bash
lixblogs login --open
lixblogs whoami
lixblogs logout
```

`login` displays a verification URL and one-time code. Approve only the scopes you need. `register` opens the official Accounts registration page and continues into the same device flow. The longer `auth login`, `auth status`, and `auth logout` forms remain supported aliases.

Credentials are stored in the operating-system keychain. On a headless system, the CLI fails closed unless you explicitly select its non-persistent fallback.

### Authenticate automation with a personal access token

Create a scoped token in **Settings → API** for CI jobs, containers, or scheduled processes. Pass it through the process environment:

```bash
LIXBLOGS_TOKEN="$LIXBLOGS_PAT" lixblogs blog list --json --no-input
```

Or mount it as a secret file:

```bash
lixblogs --token-file /run/secrets/lixblogs blog list --json --no-input
LIXBLOGS_TOKEN_FILE=/run/secrets/lixblogs lixblogs whoami --json --no-input
```

Credential resolution is deterministic: `--token-file`, then `LIXBLOGS_TOKEN`, then `LIXBLOGS_TOKEN_FILE`, then the active device-login profile. Direct tokens are not persisted locally. The API remains authoritative for their scopes and personal or organization boundary.

## Profiles and scopes

```bash
lixblogs login --profile work --scope openid --scope profile \
  --scope lixblogs:profile:read --scope lixblogs:blog:read \
  --scope lixblogs:blog:write
lixblogs profiles
lixblogs use work
lixblogs whoami --profile work --json
```

Read and draft workflows need `lixblogs:blog:read` and `lixblogs:blog:write`. Publishing, organization management, collaboration, and deletion use separate scopes. `whoami` reports the active profile, identity, environment, scopes, and expiry without exposing credentials.

## Draft and revise Markdown

```bash
lixblogs blog list --status draft
lixblogs blog create --file post.md --title "A post" --tag engineering
cat post.md | lixblogs blog edit BLOG_ID --stdin
lixblogs blog edit BLOG_ID --editor
lixblogs blog get BLOG_ID --json
```

Use one content source: `--file`, `--stdin`, `--content`, or `--editor`. `--publication personal` is the default; organization targets use `--publication org:ORG_ID` and optionally `--collection COLLECTION_ID`. Use `--dry-run` to validate without writing.

Edits carry the current ETag. A concurrent change exits with code 3 and stores the local input and latest server Markdown under `.lixblogs-conflicts/` instead of overwriting either version.

Metadata flags include `--title`, `--subtitle`, `--slug`, repeated `--tag`, `--emoji`, `--cover`, publication and collection targets, membership/secret/comment controls, and cover position or zoom.

## Publish, history, and recover

```bash
lixblogs blog publish BLOG_ID --dry-run
lixblogs blog publish BLOG_ID --yes
lixblogs blog unpublish BLOG_ID --yes
lixblogs blog delete BLOG_ID --yes
lixblogs blog restore BLOG_ID --yes
lixblogs blog history BLOG_ID
lixblogs blog history BLOG_ID --version VERSION_ID
lixblogs blog restore-version BLOG_ID --version VERSION_ID --yes
```

Publishing and state transitions require `--yes`. Deletion moves a post to trash by default. Permanent deletion additionally needs `--permanent`, the permanent-delete scope, and explicit confirmation.

History lists the timestamp, author, word count, and excerpt for each retained content snapshot. Inspect an exact version before restoring it; restoration first saves the current document as an undo point.

## Comments and media

```bash
lixblogs comment list BLOG_ID
lixblogs comment add BLOG_ID --content "Clear explanation"
lixblogs comment reply BLOG_ID --parent COMMENT_ID --content "Following up"
lixblogs comment delete BLOG_ID --comment COMMENT_ID --yes

lixblogs media upload --file diagram.webp --blog BLOG_ID --type inline --attach
lixblogs integrations pollinations-status --json
lixblogs media generate --prompt "Editorial illustration" --model flux --blog BLOG_ID --type cover --attach
lixblogs media delete MEDIA_ID --yes
```

Image generation uses the Pollinations account connected in **Settings → Integrations**. The provider key stays on the server. Each generate command is one explicit billable attempt and is never automatically retried; keep the local output so a failed Cloudinary upload can be retried without regenerating.

## Curated collections

```bash
lixblogs collection list
lixblogs collection create --title "Systems reading" --visibility private
lixblogs collection add COLLECTION_ID --blog BLOG_ID --note "Recommended introduction"
lixblogs collection entries COLLECTION_ID
lixblogs collection edit COLLECTION_ID --visibility public
lixblogs collection remove COLLECTION_ID --blog BLOG_ID --yes
```

Collections reference the canonical public story and retain its original author and license. Reads use `lixblogs:blog:read`; changes use `lixblogs:blog:write`. See [Curated collections](/docs/collections) for visibility and author-control rules.

## Writing contests

```bash
lixblogs contest list --status live
lixblogs contest create --title "Open web" \
  --starts-at 2026-10-01T00:00:00Z \
  --submissions-close-at 2026-10-15T23:59:59Z \
  --judging-closes-at 2026-10-20T23:59:59Z \
  --problem "Write about the open web" \
  --rules "Original work only" \
  --minimum-account-age-months 1 --require-bio
lixblogs contest publish CONTEST_ID --yes
lixblogs contest submit CONTEST_ID --blog BLOG_ID
lixblogs contest submissions CONTEST_ID --snapshot --json
lixblogs contest results CONTEST_ID --award winner:SUBMISSION_ID --finalize --yes
```

The CLI covers contest drafts, metadata and eligibility edits, lifecycle filtering, publication and cancellation, moderator and judge roles, entries and withdrawals, frozen judging snapshots, placements, and final results. `contest delete` is restricted to organizer-owned private drafts and requires `lixblogs:blog:delete`. See [Writing contests](/docs/contests) for the full lifecycle and authorization model.

## Automation contract

Use `--json --no-input` in scripts and agent workflows:

```bash
lixblogs blog list --status draft --json --no-input
lixblogs blog publish BLOG_ID --dry-run --json --no-input
lixblogs blog publish BLOG_ID --yes --json --no-input
```

- stdout contains data; diagnostics use stderr.
- JSON mode has no ANSI styling, banners, or prompts.
- `--quiet` suppresses non-essential human output.
- Mutations accept `--idempotency-key`; safe reads and idempotent writes retry one transient response.
- Errors contain `code`, `message`, `hint`, and `requestId`. Credentials are redacted.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Request or server failure |
| `2` | Invalid command or flag |
| `3` | Revision conflict |
| `4` | Login or scope failure |
| `5` | Required confirmation missing |

## Troubleshooting and revocation

- `account_not_provisioned`: sign in to LixBlogs once, then retry.
- `insufficient_scope`: run `lixblogs login` again with the named scope.
- `revision_conflict`: inspect `.lixblogs-conflicts/`, merge, then retry against the new revision.
- expired device code: restart `lixblogs login`.
- unavailable keychain: configure the OS keychain or explicitly use the documented non-persistent fallback.

`lixblogs auth revoke --yes` revokes the server credential and clears its local profile. `logout` only clears local credentials.

## Agent skills

The package includes individually installable authoring, publishing, organization, editorial, analytics, and media skills:

```bash
lixblogs skill list --json
lixblogs skill inspect lixblogs-author
lixblogs skill install lixblogs-author --target .agents/skills --dry-run
lixblogs skill install lixblogs-author --target .agents/skills --yes
```

Install only the workflow needed for the current task. Skill installation never overwrites an existing folder unless `--force --yes` is explicit. Each skill uses the same JSON, scope, confirmation, and recovery contracts documented above.

### Bootstrap a separate agent workspace

Skills are bundled in the npm package, so a machine does not need a checkout of the LixBlogs repository. From the target workspace:

```bash
npm install --global @elixpo/lixblogs-cli
lixblogs skill install --all --target .agents/skills --dry-run --json --no-input
lixblogs skill install --all --target .agents/skills --yes --json --no-input
lixblogs login
```

An agent should read only the skill relevant to its task from `.agents/skills/`. Use a different `--target` when the agent runtime discovers workspace skills elsewhere. Installing skills does not authenticate the CLI and does not grant scopes; device login remains a separate user-approved action.

For headless automation, [PAT credential support is tracked separately](https://github.com/elixpo/blogs.elixpo/issues/301). Until it reaches the published package, unattended jobs should not copy keychain credentials or browser sessions into a runner.
