# Development TODO

This is the local source of truth for implementation order. GitHub issues provide discussion and ownership; completed work remains checked here for quick repository context.

## Completed milestones

- [x] [WP-001 — workspace bootstrap](https://github.com/elixpo/crumb.elixpo/issues/1)
- [x] [WP-002 — persistent Linux Bash PTY](https://github.com/elixpo/crumb.elixpo/issues/4)
- [x] [WP-003 — macOS Zsh parity](https://github.com/elixpo/crumb.elixpo/issues/6) ([PR #7](https://github.com/elixpo/crumb.elixpo/pull/7))
- [x] [WP-004 — Windows PowerShell parity](https://github.com/elixpo/crumb.elixpo/issues/8) ([PR #9](https://github.com/elixpo/crumb.elixpo/pull/9))
- [x] [WP-005 — shell lifecycle protocol](https://github.com/elixpo/crumb.elixpo/issues/10) ([PR #12](https://github.com/elixpo/crumb.elixpo/pull/12))
- [x] [WP-006 — terminal UI layer](https://github.com/elixpo/crumb.elixpo/issues/13) ([PR #14](https://github.com/elixpo/crumb.elixpo/pull/14))
- [x] [WP-007 — persistent history](https://github.com/elixpo/crumb.elixpo/issues/15) ([PR #17](https://github.com/elixpo/crumb.elixpo/pull/17))
- [x] [WP-008 — provider-neutral LLM interface](https://github.com/elixpo/crumb.elixpo/issues/19) ([PR #20](https://github.com/elixpo/crumb.elixpo/pull/20))
- [x] [WP-009 — Pollinations adapter](https://github.com/elixpo/crumb.elixpo/issues/21) ([PR #23](https://github.com/elixpo/crumb.elixpo/pull/23))
- [x] [WP-010 — secure Pollinations BYOK](https://github.com/elixpo/crumb.elixpo/issues/24) ([PR #27](https://github.com/elixpo/crumb.elixpo/pull/27))
- [x] [WP-011 — browser account connector](https://github.com/elixpo/crumb.elixpo/issues/26) ([PR #28](https://github.com/elixpo/crumb.elixpo/pull/28))

## Completed platform parity

- [x] [Linux terminal parity](https://github.com/elixpo/crumb.elixpo/issues/16) ([PR #18](https://github.com/elixpo/crumb.elixpo/pull/18))

<details>
<summary>WP-011 completion details</summary>

- [x] Add the minimal Next.js Cloudflare Worker surface.
- [x] Add Elixpo Accounts sign-in with `openid profile email`.
- [x] Adapt the Pollinations PKCE connector.
- [x] Register a separate public Accounts CLI device client.
- [x] Exchange verified Accounts device authorization for the linked connector.
- [x] Encrypt provider tokens at rest in D1.
- [x] Replace pasted-key login with the browser connection flow.
- [x] Keep the OS keyring as the terminal credential boundary.
- [x] Pin the initial multimodal Pollinations connector allowlist.
- [x] Configure local D1, KV, and `.env.local` credentials.
- [x] Register and validate the signed Accounts deletion webhook.
- [x] Validate the browser-to-terminal flow.
- [x] Pass Rust and web checks.
- [x] Merge WP-011.

</details>

<details>
<summary>WP-001 completion details</summary>

- [x] Create the Cargo workspace.
- [x] Add `crumb-cli`, `crumb-core`, `crumb-repl`, and `crumb-platform`.
- [x] Detect Linux, macOS, and Windows with a typed `Platform` enum.
- [x] Render a minimal prompt containing the working directory.
- [x] Implement `/exit`, `/version`, and `/platform`.
- [x] Classify all other input as `NativeInput` without executing it.
- [x] Add unit tests and cross-platform GitHub Actions.
- [x] Pass formatting, clippy, and workspace tests.
- [x] Publish WP-001 to `main`.

</details>

## Active CLI package: `/` commands and `@` references

- [x] Keep plain English as the only natural-language prompt form.
- [x] Reserve known `/` commands without intercepting native absolute paths.
- [x] Implement `/help`, `/skills`, `/connectors`, and `/context`.
- [x] Keep authentication, history, platform, version, shell, and exit commands functional.
- [x] Add Tab suggestions for slash commands and typed inline references.
- [x] Load enabled skill and configured MCP/plugin identifiers into suggestions.
- [x] Bound file and folder suggestions to the active workspace.
- [x] Resolve selected `@file` and `@folder` references into bounded, redacted agent context.
- [x] Implement `/attach`, `/detach`, and persistent session context.
- [x] Implement live `/mode`, `/model`, `/effort`, and `/config` changes.
- [x] Add the installable terminal UI and binary packaging pass.

## Active terminal UX pass

- [x] Make the interactive startup identity use the Crumb ASCII mark and product punchline.
- [x] Keep non-interactive output free of startup branding and animations.
- [x] Render Harness turns with model, mode, effort, cancellation guidance, and session metadata.
- [x] Add a self-clearing inline activity indicator for synchronous Harness turns.
- [x] Replace flat help output with a grouped `/` command palette.
- [x] Add read-only `/mode`, `/model`, `/effort`, `/config`, and `/plugins` surfaces.
- [x] Stream real Harness notifications into the renderer instead of projecting them after completion.
- [x] Expose bounded Pollinations web search through MCP with an explicit network-tool grant.
- [x] Add provider-neutral, public-HTTPS page fetching with DNS, redirect, byte, and time bounds.
- [x] Add bounded Enter-to-steer and Ctrl+Enter FIFO follow-ups with queue replacement.
- [x] Add safe active-turn pause/resume while retaining steering and bounded queued follow-ups.
- [x] Add queued steering and richer tool-specific event projection to the Harness stream.
- [x] Add interactive approval, tool-call, patch, error, and completion components.
- [x] Add live model, effort, and mode selection backed by atomic configuration writes.
- [x] Add terminal-width snapshots, reduced-motion behavior, and accessibility checks.
- [x] Package standalone Linux, macOS, and Windows archives with checksums,
  SPDX SBOMs, keyless Sigstore signatures, and provenance attestations.
- [x] Add checksum-verifying repository installers for POSIX shells and Windows
  PowerShell.
- [ ] Configure Apple Developer ID/notarization and Windows Authenticode in the
  protected release environment before advertising a stable native release.

### Competitive terminal roadmap

- [x] [Stream Harness activity and support queued steering](https://github.com/elixpo/crumb.elixpo/issues/36)
- [x] [Add reviewable diffs, checkpoints, and safe rewind](https://github.com/elixpo/crumb.elixpo/issues/37)
- [x] [Ship modern input editing, shell completions, and accessibility modes](https://github.com/elixpo/crumb.elixpo/issues/38)
- [x] [Add resumable and searchable agent sessions](https://github.com/elixpo/crumb.elixpo/issues/35)
- [x] [Add opt-in background jobs and scheduled agent work](https://github.com/elixpo/crumb.elixpo/issues/34)
- [x] [Add pluggable Codex and Claude coding-agent backends](https://github.com/elixpo/crumb.elixpo/issues/39)
- [x] [Add terminal-configurable Harness providers and explicit model selection](https://github.com/elixpo/crumb.elixpo/issues/40)
  - [x] Add the provider-neutral, non-secret endpoint and capability schema.
  - [x] Add validated atomic terminal mutations for providers, models, mode, and effort.
  - [x] Add OpenRouter/Pollinations presets and typed credential/header references.
  - [x] Add advanced provider, compatibility, pricing, retry, and model mutations.
  - [x] Project selected providers into the replaceable Harness adapter.
  - [x] Add lazy model discovery and local compatibility diagnostics.

## Proposed roadmap: context, ecosystem, and release readiness

These tracking issues define the next major phases. Implementation should be split into small,
independently reviewable work packages under each tracker. Marketplace packages and optional
engines remain replaceable; none may bypass Crumb's permission, credential, or shell boundaries.

### Phase 1 — grounded context

- [x] [Add provenance-aware memory retrieval and conflict handling](https://github.com/elixpo/crumb.elixpo/issues/43).
- [x] [Add named personas and portable agent profiles](https://github.com/elixpo/crumb.elixpo/issues/44).
- [x] [Add graph-grounded project context with an optional Graphify adapter](https://github.com/elixpo/crumb.elixpo/issues/45).
  - [x] [WP-024: provider-neutral graph core and pinned Graphify adapter](https://github.com/elixpo/crumb.elixpo/issues/100).
  - [x] [WP-032: qualify Graphify retrieval and native fallback](https://github.com/elixpo/crumb.elixpo/issues/122).
  - Keep Graphify local-first, enabled by default, pinned, and replaceable.
  - Require source/edge provenance, freshness detection, bounded retrieval, and native-search fallback.
  - Route its MCP surface through Crumb's approval and supervision boundary.

### Phase 2 — extensible ecosystem

- [ ] [Expand the public skill and connector ecosystem](https://github.com/elixpo/crumb.elixpo/issues/46).
  - [x] [WP-034: register external skills and qualify Harness context lifecycle](https://github.com/elixpo/crumb.elixpo/issues/126).
  - [x] Bundle an offline core skill set with explicit load/unload controls.
  - [x] Add read-only stack detection and approval-gated disposable tool execution.
  - [x] Add bounded read-only parallel agents with short session identities.
  - Defer all connector implementation until the connector-free terminal is release-ready.
- [x] [Supervise and authorize third-party MCP servers](https://github.com/elixpo/crumb.elixpo/issues/47).
  - [x] Supervise bounded local STDIO MCP servers ([PR #96](https://github.com/elixpo/crumb.elixpo/pull/96)).
  - [x] Supervise remote Streamable HTTP MCP servers ([issue #97](https://github.com/elixpo/crumb.elixpo/issues/97)).
  - [x] [WP-033: audit supervised MCP lifecycle and tool outcomes](https://github.com/elixpo/crumb.elixpo/issues/124).
- [x] [Build marketplace trust, publishing, updates, rollback, and revocation](https://github.com/elixpo/crumb.elixpo/issues/48).
  - [x] [WP-025: marketplace schema v2 trust metadata](https://github.com/elixpo/crumb.elixpo/issues/106).
  - [x] [WP-026: bounded remote catalog sync and offline cache](https://github.com/elixpo/crumb.elixpo/issues/108).
  - [x] [WP-027: signed catalog and per-artifact Sigstore verification](https://github.com/elixpo/crumb.elixpo/issues/110).
  - [x] [WP-028: persist and manage installed marketplace releases](https://github.com/elixpo/crumb.elixpo/issues/114).
  - [x] [WP-029: plan authenticated marketplace updates and revocations](https://github.com/elixpo/crumb.elixpo/issues/116).
  - [x] [WP-030: activate verified marketplace rollback releases](https://github.com/elixpo/crumb.elixpo/issues/118).
  - [x] [WP-031: apply verified marketplace updates atomically](https://github.com/elixpo/crumb.elixpo/issues/120).
  - Keep external packages disabled after installation until the user reviews and enables them.
  - Prefer standard remote MCP OAuth and OS-keyring credential references.
  - Prohibit arbitrary install hooks and implicit capability grants.

### Phase 3 — public distribution, deliberately deferred

- [ ] [Package and sign Crumb for Linux, macOS, and Windows](https://github.com/elixpo/crumb.elixpo/issues/49).
  - Do not publish terminal binaries, installers, or updater metadata before the release-readiness gate is explicitly approved.
  - Require signatures, checksums, SBOMs, provenance attestations, upgrade/rollback tests, and uninstall coverage for every platform.

## Planned work packages

- [x] [WP-012 — deterministic agent/session foundation](https://github.com/elixpo/crumb.elixpo/issues/33) ([design](agent-foundation.md)).
- [x] [DeepSeek Harness + RTK/token optimizers](https://github.com/elixpo/crumb.elixpo/issues/22): [Harness adapter](deepseek-harness.md) and measured [optimizer pipeline](token-optimization.md).
- [x] [Skills and natural-language routing](https://github.com/elixpo/crumb.elixpo/issues/25): valid commands stay native; unresolved phrases follow configured deterministic policy.
- [x] Implement the [`/` command and `@` reference catalog](../product/input-namespaces-and-connectors.md) incrementally; neither symbol activates an AI prompt.
- [ ] Add non-Pollinations connectors in the catalog's priority order, starting with GitHub, Google Drive, Cloudinary, email, and calendar. Deferred until the selective-prompt smoke-test gate passes.
- [x] [Crumb MCP policy boundary](mcp-boundary.md): Rust-owned risk, approvals, cancellation, and workspace confinement.
- [x] Refine the standalone CLI UI after the harness and optimizers.
  - [x] Add compact panda branding, startup readiness, and model/mode status.
  - [x] Add inline history autosuggestions alongside `/` and `@` completion.
  - [x] Add a muted empty-composer placeholder that cannot be accepted as input.
  - [x] Add a one-line activity surface with live tool-state labels.
  - [x] Add alternate-screen terminal takeover with an inline-mode escape hatch.
  - [x] Gate interactive startup on explicit current-folder trust.
  - [x] Surface effort, session budget, estimated context use, and Harness auto-compaction.
  - [x] Keep the startup header fixed above a bounded scrolling transcript.
  - [x] Keep the composer and responsive hotkey guide pinned below the transcript.
  - [ ] Add the final panda application icon and platform launcher metadata (native distribution gate).
  - [x] Add responsive composer borders and a context/model status meter.
  - [x] Add checksum-verifying repository installers and signed release archives.
  - [ ] Add platform-native installers and desktop launch entries (native distribution gate).
- [x] Resume the `crumb.elixpo` production web UI after the CLI UI.
- [x] Stream AI question-mode output and Harness activity.

Platform-native signing, launchers, and non-Pollinations connectors remain
intentionally deferred until the selective-prompt smoke tests are complete.
Portable release archives, SBOMs, provenance, Sigstore signatures, and direct
repository installers are implemented. Pollinations is the only production
connector in the current release candidate.

Later work packages remain defined in the [master plan](../product/master-plan.md). Only the current and immediately upcoming package should be expanded into implementation-level tasks.

## Validation commands

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --all-targets
```
