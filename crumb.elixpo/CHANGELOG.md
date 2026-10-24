# Changelog

This file records notable public changes to Crumb. Until the first stable
release, behavior and interfaces may change without compatibility guarantees.

## Unreleased

- Elixpo's `.deb` packages are now versioned `<version>-1~elixpo1`, so the
  official Debian package of the same version takes precedence once
  available.

## 1.0.4 - 2026-10-21

- Added a `debian` build profile that uses the system SQLite library and
  environment-variable credentials, and compiles without remote Sigstore
  verification, so Crumb builds from Debian-packaged Rust crates.
- Moved the official Debian source packaging to Salsa; release tarballs no
  longer ship a `debian/` directory.
- Upgraded the website to Next.js 16.

## 1.0.3 - 2026-10-19

- Added `amd64` and `arm64` Debian packages to protected releases.
- Added SHA-256 checksums, Sigstore bundles, and build-provenance attestations
  for each Debian package.
- Documented the separate paths for Elixpo APT distribution and official
  Debian archive sponsorship.

## 1.0.2 - 2026-10-19

- Added manually authorized cross-platform GitHub Releases with checksums,
  SPDX SBOMs, Sigstore signatures, and build-provenance attestations.
- Added checksum-verifying one-line installers for Linux, macOS, and Windows.
- Defined Crumb as Elixpo's self-hosted autonomous Rust agent harness and
  natural-language terminal, powered by Pollinations by default.
- Added the Elixpo Repository Standard 1.0 manifest and public governance,
  contribution, support, conduct, and security policies.
- Replaced repository-local Elixpoo automation with the shared v2 workflow
  callers maintained by `elixpo/agent.elixpo`.

Published versions and artifacts are available from
[GitHub Releases](https://github.com/elixpo/crumb.elixpo/releases).
