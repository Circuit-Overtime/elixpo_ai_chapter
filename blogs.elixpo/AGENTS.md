# Agent Guidelines for blogs.elixpo

Real-time collaborative blogging platform

## Architecture

- **Runtime**: Node.js 22 for CI; Next.js 15 App Router at the Cloudflare edge.
- **Language**: JavaScript/JSX with TypeScript configuration for tooling and packages.
- **Hosting**: Cloudflare Pages, Workers, D1, KV, and deployment environments.
- **Identity**: Elixpo Accounts OAuth 2.0 with an HTTP-only session cookie.
- **Media**: Cloudinary through server-owned upload routes.
- **Editor**: BlockNote with Elixpo custom blocks; Yjs provides collaborative state.

## Repository Structure

- `app/` — App Router pages, layouts, metadata, and API routes.
- `src/components/` — reusable UI and the BlockNote editor implementation.
- `src/views/` — page-level views used by thin App Router wrappers.
- `src/context/` — client state, including authentication.
- `lib/` — server-side authentication, storage, quota, and platform utilities.
- `migrations/` — ordered Cloudflare D1 migrations; never rewrite an applied migration.
- `worker/` — Cloudflare Worker entry points and platform bindings.
- `packages/` — independently released editor, CLI, and extension artifacts.
- `tests/` — Node test-runner coverage used by the required `Unit tests` check.
- `.elixpo/project.yml` — machine-readable repository and CI contract.

## Hard Constraints

- Keep App Router pages thin; shared page implementations belong in `src/views/`.
- Cloudflare-bound code must remain edge-compatible and must not assume D1 is available during local development.
- Never expose OAuth, Cloudinary, Cloudflare, moderation, payout, npm, or extension-publishing secrets to client code or fork pull requests.
- Fork pull requests receive only the secretless quality gate. Preview and production deployment remain trusted-context operations.
- Do not apply remote D1 migrations, publish packages, or deploy production as part of ordinary development verification.
- Do not edit an applied migration; create the next ordered migration.
- Keep package releases and production deployment in the gated workflows that own their credentials.
- Preserve `.elixpo/project.yml` compatibility with repository automation and keep the required test and Cloudflare-build workflows aligned with its CI commands.

## Git & PR Workflow

- **Never commit directly to `main`.** Use a feature branch and pull request even if repository settings temporarily fail to enforce the policy.
- Branch naming: `elixpo/<issue-n>-<hex>` for agent-driven changes; `feat/<slug>` / `fix/<slug>` for manual.
- Commit format: conventional — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`.
- PR title: `[ELIXPO] <short>` for agent PRs.
- PR body ends with `Fixes #N` so GitHub auto-closes on merge.

## Communication Style

- Bullets over paragraphs. <200 words per PR body / comment unless the change genuinely needs more.
- Facts, not opinions. Link specific files/lines rather than describing.
- No marketing language ("seamlessly", "robust", "leverages").
- No hedging ("I think", "maybe").

## Agent Voice

- Never say "Claude", "Claude Code", "AI", "LLM", "analyzing".
- Speak as a teammate: "looking into this", "pushed a fix", "opened #N".

## Workflow Orchestration (for agents)

- Read `.elixpo-context/context.md` ONCE at the start if injected into the prompt; otherwise use `Glob`/`Grep` to locate files directly. Don't `ls -R`.
- For issue work, follow `.claude/commands/respond-to-issue.md` — question vs implement vs decline.
- For commit / push / PR, follow `.claude/commands/commit-push-pr.md`.
- For mechanical bulk refactors (>3 files, renames, string migrations), use `python .github/scripts/apply_refactor.py` with a JSON plan on stdin — one deterministic call beats N Read+Edit roundtrips.

## Common Mistakes

- Running plain `next build` as the only release check; Cloudflare compatibility is verified by `npm run pages:build`.
- Creating `.dev.vars`; Wrangler can prefer it over `.env.local` and hide stale configuration.
- Giving fork workflows access to preview or deployment credentials.
- Treating the root app, `@elixpo/lixeditor`, the CLI, and the VS Code extension as one release artifact.
- Editing D1 migrations that may already have run remotely.

@RTK.md
