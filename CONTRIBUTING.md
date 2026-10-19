# Contributing to Crumb

Crumb is Elixpo's self-hosted autonomous agent harness and natural-language
terminal. Contributions should strengthen that product boundary: local
execution, inspectable tool use, replaceable infrastructure, and Pollinations
as the default inference layer.

## Before starting

- Search existing issues and open an issue for substantial behavioral or
  architectural changes.
- Keep a pull request focused on one reviewable outcome.
- Do not commit credentials, private prompts, personal data, generated build
  output, or agent traces containing sensitive content.
- Preserve the boundary between the native Rust harness and optional external
  connectors. An external runtime must not become required for the core CLI.

## Checks

Run the checks that cover the area you changed:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-targets
cargo build --workspace --all-targets
```

For the website, work from `crumb.elixpo/` and run its documented lint and
build commands. Maintainers may ask for narrower checks when a change affects
only documentation or policy.

## Licensing and authorship

The repository's [LICENSE](LICENSE) and [notice board](LICENSES/NOTICE) control
contributions. Code is accepted under `MIT`, assets under `CC-BY-4.0`, and the
separate `TRADEMARKS.md` policy governs reserved names and identity. The
Developer Certificate of Origin applies to every commit. By contributing, you
confirm that you have the right to submit the work under those terms.

See [GOVERNANCE.md](GOVERNANCE.md), [SUPPORT.md](SUPPORT.md), and
[SECURITY.md](SECURITY.md) for decision, support, and private-reporting paths.
