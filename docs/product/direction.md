# Crumb product direction

**Decision date:** 18 October 2026  
**Status:** Active pre-release implementation

Crumb is Elixpo's handmade, self-hosted autonomous agent harness and natural
language terminal. The Crumb process, native harness, permission broker,
memory, sessions, tools, checkpoints, background work, and shell integration
run under the user's control. Pollinations is the default model intelligence
and multimodal provider.

Self-hosted describes Crumb's execution and control plane. Pollinations model
inference remains a connected service unless a user deliberately configures a
compatible alternative. Crumb must not imply that remote inference runs on the
user's machine.

## Product contract

- Crumb owns its primary agent loop in Rust; it does not depend on an external
  coding agent to plan or execute ordinary autonomous work.
- The agent may pursue multi-step goals, use skills, supervise bounded parallel
  work, call approved tools, retain provenance-aware memory, create
  checkpoints, and resume background tasks.
- Bash, Zsh, and PowerShell keep ownership of native shell semantics. Normal
  commands never require a model, a network, or Pollinations.
- Models propose actions but cannot grant permissions, expose secrets, widen a
  workspace boundary, or disable cancellation and audit evidence.
- Pollinations is the default provider and powers the standard model routes.
  Provider code remains outside `crumb-core`, and optional compatibility
  adapters remain replaceable.
- The terminal remains usable when every agent or provider feature fails.

## Relationship to Elixpoo

Crumb and Elixpoo are deliberately separate products. Crumb is a user-operated
autonomous development harness that may modify a workspace within granted
permissions. Elixpoo is Elixpo's organization-wide GitHub project-management
agent and deterministically refuses product-code implementation. Neither is a
backend, alias, or deployment mode of the other.

## Release boundary

Crumb is active but pre-release. Source availability and completed work
packages do not yet constitute a supported binary release. Public installers
follow cross-platform packaging, signing, security review, and release
readiness.
