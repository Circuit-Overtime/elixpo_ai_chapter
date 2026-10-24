# Input namespaces and connector catalog

Crumb keeps prompting natural: a user writes a normal sentence without `?`,
`@`, or another activation prefix. The deterministic router keeps known shell
commands native and sends eligible natural-language requests to the agent.

## `:` — explicit agent override

`:` sends the remaining text directly to the agent when a command-shaped or
deliberately terse prompt would otherwise be ambiguous. For example,
`:summarize status` reaches the agent without changing the normal routing rules.

## `/` — Crumb actions

`/` opens Crumb's command palette. Slash commands are handled locally and are
never interpreted as prompts or passed to the native shell accidentally.

### Keep now

- `/auth login|status|logout`
- `/history` and `/history search <text>`
- `/platform`
- `/version`
- `/shell`
- `/exit`

### Add with the agent UI

- `/help` — searchable command and shortcut help
- `/mode auto|negotiate|plan` — change agent autonomy
- `/model` — inspect or select a model route
- `/effort` — inspect or set reasoning effort
- `/session list|inspect|resume|search|rename|archive|restore|export|delete` — manage redacted agent sessions
- `/context` — show the context budget and attached references
- `/attach` and `/detach` — manage files, folders, or connector resources
- `/connectors` — list, connect, inspect, or revoke integrations
- `/skill search|inspect|install|enable|disable|run|remove|doctor` — manage and explicitly run skill packages
- `/skills` and `/plugins` — inspect legacy local-skill registrations and plugin capabilities
- `/tools` — show available tools and their risk classes
- `/permissions` — inspect or change user-granted policy
- `/memory` — inspect, edit, or clear user-approved memory
- `/config` — inspect and safely patch live configuration
- `/pause` — safely cancel the active execution boundary and hold the turn for resume, steering, or more queued follow-ups
- `/resume` — continue a paused turn from the last safe point after checking current session and workspace state
- `/cancel` — cancel the active agent turn and its child processes
- `/doctor` — diagnose Harness, provider, connector, and optimizer health
- `/cost` — show session token and provider usage when available

The command palette may insert a typed `@` reference. For example,
`/attach` can produce `@file:README.md`, while `/connectors use github` can
produce `@connector:github`.

## `@` — inline context references

`@` identifies context inside an otherwise normal request. It is not an agent
activation prefix and does nothing without a surrounding command or prompt.

- `@file:<path>` — one local file
- `@folder:<path>` — a bounded directory view
- `@selection` — the current terminal or editor selection
- `@clipboard` — clipboard content after explicit user confirmation
- `@last-error` — the previous native command's bounded diagnostics
- `@diff` — the current repository diff
- `@session:<id>` — an existing Crumb session
- `@skill:<id>` — a discovered skill
- `@plugin:<id>` — an installed plugin capability
- `@connector:<id>` — a connected external service

References resolve deterministically before model input. Missing, ambiguous,
oversized, or unauthorized references fail visibly. Referencing a connector
does not grant permission to use it.

## Skill activation boundary

`crumb skill search <query>` reads compact catalog metadata only. It never
downloads instructions or changes agent context. `inspect` shows package
provenance and requirements, `install` verifies and registers components in a
disabled state, and `enable` is a separate explicit action. Natural-language
routing may recommend these commands, but cannot invoke installation or
enablement on the user's behalf. `crumb skill run <publisher/name>[@version] --
<task>` and its interactive `/skill run` equivalent require an active installed
release whose exact instruction files are already enabled. Skill text remains
workflow guidance: it cannot grant permissions or expand the requested task.

Remote discovery is lazy and explicit: search authenticates one bounded compact index, while
inspect fetches only the exact manifest selected from that index and verifies its pinned digest.
Validated compact indexes and exact manifests may be reused offline. There is no marketplace
network activity at startup and discovery never activates a skill.

## Connector rollout

### Available foundation

- **Pollinations** — text, image, video, audio, transcription, embeddings, and
  3D generation through the user's connected account.

### Priority 1

- **GitHub** — repositories, code search, issues, pull requests, releases, and
  Actions; writes require per-operation approval.
- **Google Drive** — find, read, create, and organize user-selected files.
- **Cloudinary** — upload, transform, search, and manage generated media.
- **Gmail** and **Outlook Email** — search and draft first; sending always
  requires explicit confirmation.
- **Google Calendar** and **Outlook Calendar** — read availability and propose
  events; creating, changing, or deleting events requires confirmation.

### Priority 2

- **GitLab** — repositories, merge requests, issues, and pipelines.
- **Slack** and **Microsoft Teams** — search and summarize; posting requires
  confirmation.
- **Notion** — search, read, create, and update approved pages/databases.
- **Linear**, **Jira**, and **Confluence** — issue and project workflows.
- **OneDrive**, **SharePoint**, and **Dropbox** — document storage and sharing.
- **Amazon S3** and **Cloudflare R2** — scoped object storage for project and
  generated-media workflows.

### Priority 3

- **Discord** — community search, summaries, and confirmed posting.
- **Figma** — inspect design context and export approved assets.
- **Google Contacts** and **Microsoft People** — contact lookup with narrow
  scopes and no silent modification.
- **PostgreSQL**, **MySQL**, and **SQLite** — schema-aware, read-only by default;
  mutations require an isolated approval path.
- **Cloudflare**, **AWS**, **Google Cloud**, and **Azure** — diagnostics first;
  infrastructure changes require explicit plans and approvals.

## Connector requirements

Every connector must provide:

- OAuth or delegated authorization through Accounts Elixpo; no pasted secrets
  when a safe account flow exists.
- Least-privilege scopes, read-only defaults, capability discovery, and clear
  reauthorization when scopes change.
- Per-action risk classification and user approval outside the model.
- Revocation, account-deletion cleanup, token rotation, and visible connection
  health.
- Bounded, redacted outputs; credentials never enter prompts, memories,
  journals, terminal history, or logs.
- A replaceable MCP or native adapter so provider details do not leak into the
  shell core.
