# Agent Guidelines for art.elixpo

AI-powered art generation platform

<!-- TODO: Fill in the sections below with repo-specific details. The stub
     below is a template; keep what applies, remove what doesn't. -->

## Architecture

<!-- TODO: Describe the runtime, language, framework, key services, hosting. -->
- **Runtime**: <TODO>
- **Language**: <TODO>
- **Hosting**: <TODO>

## Repository Structure

<!-- TODO: One-line per top-level dir describing its purpose. -->

## Hard Constraints

<!-- TODO: List constraints that would break the build / tests / deploy if
     violated. Example from accounts.elixpo: "every API route must export
     `export const runtime = 'edge'`". -->

## Git & PR Workflow

- **Never commit to `main`.** It's branch-protected; use a feature branch.
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

## Common Mistakes (fill in as you discover them)

<!-- TODO: Track mistakes contributors / agents have actually made in this
     repo so future passes avoid them. Keep concrete and specific. -->
