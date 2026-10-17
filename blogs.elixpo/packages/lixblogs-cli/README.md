# @elixpo/lixblogs-cli

Publish, manage, and inspect LixBlogs through its stable API v1. The CLI uses
device authorization and predictable terminal or JSON output.

```bash
npm install -g @elixpo/lixblogs-cli
lixblogs --help
```

### Authentication

```bash
node bin/lixblogs.mjs login
node bin/lixblogs.mjs login --profile personal
node bin/lixblogs.mjs whoami
node bin/lixblogs.mjs profiles
node bin/lixblogs.mjs use work
node bin/lixblogs.mjs logout
node bin/lixblogs.mjs auth revoke --yes
```

Press Enter to open the verification URL or copy it to another device. The
username becomes the profile alias unless `--profile` overrides it. Use
`profiles` and `use <username>` to switch accounts.

For CI, containers, and scheduled automation, create a scoped token in
**LixBlogs → Settings → API** and expose it only to the CLI process:

```bash
LIXBLOGS_TOKEN="$LIXBLOGS_PAT" lixblogs blog list --json --no-input
lixblogs --token-file /run/secrets/lixblogs blog list --json --no-input
LIXBLOGS_TOKEN_FILE=/run/secrets/lixblogs lixblogs whoami --json --no-input
```

Resolution order is `--token-file`, `LIXBLOGS_TOKEN`, `LIXBLOGS_TOKEN_FILE`,
then the active device-login profile. Direct tokens are not copied into the
keychain or profile registry. Scopes and personal/organization boundaries
remain server-enforced.

### Blog lifecycle

```bash
lixblogs blog list --status draft
lixblogs blog create --file post.md --title "A new post" --tag engineering
lixblogs blog get <id> --json
lixblogs blog edit <id> --editor
lixblogs blog publish <id> --yes
lixblogs blog unpublish <id> --yes
lixblogs blog delete <id> --yes
lixblogs blog list --status trashed
lixblogs blog restore <id> --yes
lixblogs blog history <id>
lixblogs blog history <id> --version <version-id>
lixblogs blog restore-version <id> --version <version-id> --yes
```

Titles, subtitles, slugs, tags, icon emoji, cover URL/position/zoom, publication target, collection, comment policy, membership, secret state, and published/unlisted visibility are supported by `blog create`, `blog edit`, and `blog publish`.

`--secret` selects anonymous public publishing while a story is still a draft;
`--not-secret` clears it before first publish. Both use the existing
`lixblogs:blog:write` scope. Secret mode hides the writer across public LixBlogs
surfaces but does not make the short-ID story URL access-restricted.

Inspect valid publication targets before assigning organization metadata:

```bash
lixblogs org list
lixblogs org get ORG_ID
lixblogs org collections ORG_ID
lixblogs org members ORG_ID
lixblogs org targets --json
```

Editorial collaboration stays separate from publishing:

```bash
lixblogs collab invitations
lixblogs collab list BLOG_ID
lixblogs collab invite BLOG_ID --user reviewer --role viewer --yes
lixblogs collab role BLOG_ID --user reviewer --role editor --yes
lixblogs collab accept BLOG_ID --yes
lixblogs collab decline BLOG_ID --yes
```

Curate public stories without copying their content or changing attribution:

```bash
lixblogs collection list
lixblogs collection create --title "Systems reading" --visibility private
lixblogs collection add COLLECTION_ID --blog BLOG_ID --note "Start here"
lixblogs collection entries COLLECTION_ID
lixblogs collection edit COLLECTION_ID --visibility public
lixblogs collection remove COLLECTION_ID --blog BLOG_ID --yes
```

Collection reads use `lixblogs:blog:read`; mutations use `lixblogs:blog:write`.

Run and enter writing contests while keeping every submitted post under its author's canonical URL:

```bash
lixblogs contest list
lixblogs contest create --title "Open web" \
  --starts-at 2026-10-01T00:00:00Z \
  --submissions-close-at 2026-10-15T23:59:59Z \
  --judging-closes-at 2026-10-20T23:59:59Z \
  --problem "Write about the open web" --rules "Original work only" \
  --tag open-web --contest-tag community --allowed-target personal \
  --minimum-account-age-months 1 --require-bio
lixblogs contest publish CONTEST_ID --yes
lixblogs contest submit CONTEST_ID --blog BLOG_ID
lixblogs contest submissions CONTEST_ID --snapshot --json
lixblogs contest role CONTEST_ID --user reviewer --role judge
lixblogs contest results CONTEST_ID --award winner:SUBMISSION_ID --finalize --yes
```

Use `contest list --mine` for contests you organize and `--status live` to filter by lifecycle. Repeat `--eligible-user <username>` to create an invite-only eligibility list; use `contest edit --clear-eligible-users` to reopen eligibility. Organizers can edit contest copy, dates, topics, targets, entry limits, and eligibility; assign or remove moderators and judges; publish or cancel; save or finalize results; and delete a private draft with `contest delete <id> --yes`.

Only organizers and judges can request frozen snapshots. Publishing, cancelling, deleting, withdrawing, and finalizing results require explicit confirmation where applicable. Published contests cannot be deleted; cancel them to preserve submissions and audit history.

### Creator analytics

Analytics is read-only and uses bounded date ranges and dimensions:

```bash
lixblogs login --scope openid --scope profile --scope lixblogs:analytics:read
lixblogs analytics query --range 30d --dimension overview --json --no-input
lixblogs analytics query --scope org:ORG_ID --range custom \
  --from 2026-07-01 --to 2026-07-31 --dimension posts --limit 25 --json --no-input
lixblogs analytics export --dimension timeline --format csv --output analytics.csv
```

Organization analytics also requires `lixblogs:organizations:read`. Results are
aggregate-only, and exports refuse to overwrite an existing file.

### Comments and media

```bash
lixblogs comment list BLOG_ID
lixblogs comment add BLOG_ID --content "Clear explanation"
lixblogs comment reply BLOG_ID --parent COMMENT_ID --content "Following up"
lixblogs comment delete BLOG_ID --comment COMMENT_ID --yes

lixblogs media upload --file diagram.webp --blog BLOG_ID --type inline --attach
lixblogs integrations pollinations-status --json
lixblogs media generate --prompt "Editorial illustration" --model flux \
  --blog BLOG_ID --type cover --attach --output cover.jpg
lixblogs media delete MEDIA_ID --yes
```

Pollinations generation uses the creator's BYOP connection in Settings. The
CLI never stores its key or retries a billable generation automatically. Keep
the local output for a manual `media upload` retry.

### Agent skills

The npm artifact bundles each skill independently:

```bash
lixblogs skill list
lixblogs skill inspect lixblogs-author
lixblogs skill install lixblogs-author --target .agents/skills --dry-run
lixblogs skill install lixblogs-author --target .agents/skills --yes
lixblogs skill install --all --target .agents/skills --dry-run
lixblogs skill install --all --target .agents/skills --yes
```

Install only the needed skill. Existing files require explicit `--force --yes`.
Each skill declares its minimum CLI version and scopes.

The skills live inside the npm artifact; a separate agent machine does not
need this repository. Run the commands from the target workspace and point
`--target` at that agent runtime's workspace-skill directory. Skill
installation is offline and does not authenticate an account or grant scopes.

`create`, `edit`, `publish`, `unpublish`, `delete`, and `restore` accept
`--dry-run`. Content input is mutually exclusive: `--file`, `--stdin`,
`--content`, or `--editor`. Permanent deletion requires
`--permanent --yes` and the `lixblogs:blog:delete:permanent` scope.

Edits use the server ETag. Conflicts exit with code 3 and retain both versions
under `.lixblogs-conflicts/` without overwriting the server revision.

### Service boundary

- `https://accounts.elixpo.com` issues, refreshes, and revokes OAuth tokens.
- `https://blogs.elixpo.com/api/v1` is the only production resource API.
- Incompatible discovery metadata and unexpected origins are rejected.
- See the [API contract](https://github.com/elixpo/blogs.elixpo/blob/main/packages/lixblogs-cli/API.md), [release policy](https://github.com/elixpo/blogs.elixpo/blob/main/packages/lixblogs-cli/RELEASE.md), and [changelog](https://github.com/elixpo/blogs.elixpo/blob/main/packages/lixblogs-cli/CHANGELOG.md).

The public production client has no client secret. Never add one.

### Troubleshooting

- `invalid_scope`: Accounts has not registered the requested permission.
- `insufficient_scope`: log in again with only the reported missing scope.
- `account_not_provisioned`: sign in to LixBlogs once, then retry.
- `precondition_failed`: fetch the current post, reconcile the retained
  conflict copy, and retry with the new revision.
- `rate_limit_exceeded`: honor `Retry-After`; do not fan out retries.
- Report the request ID, never a token or credential.
