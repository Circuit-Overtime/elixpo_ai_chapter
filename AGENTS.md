# Contributor instructions

## Architecture invariants

- Crumb's native Rust harness is the primary autonomous agent runtime.
- Pollinations is the default model provider; connected inference is not
  represented as locally self-hosted.
- External harnesses are optional compatibility adapters and cannot own
  Crumb's permissions, tools, memory, sessions, or execution policy.
- Normal commands never require AI.
- Bash, Zsh, and PowerShell retain ownership of native shell semantics.
- The interactive shell and agent execution environments stay separate.
- Models cannot grant themselves permissions.
- Secrets are never persisted in memory or logs.
- Provider details do not leak into `crumb-core`.
- Optional agent harnesses remain replaceable.
- Token filtering preserves critical diagnostics.
- Network activity never blocks terminal startup.
- The terminal remains usable when every AI feature fails.

## Development

- Keep work packages small and commit each independently.
- Do not expand a work package beyond its stated acceptance criteria.
- Run `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace --all-targets` before merging.
- Never commit credentials or include them in AI context.
