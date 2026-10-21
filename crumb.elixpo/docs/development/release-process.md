# Release process

Crumb's native CLI remains the primary product. Release staging is separate
from publication so an unsigned build can never become a public release by
accident.

## Supported release builds

The `Publish Release` workflow builds the locked `crumb-cli` package for these
targets:

- `x86_64-unknown-linux-gnu`;
- `aarch64-unknown-linux-gnu`;
- `x86_64-apple-darwin`;
- `aarch64-apple-darwin`; and
- `x86_64-pc-windows-msvc`.

Each GitHub Release contains a fixed-name archive, SHA-256 checksum, SPDX SBOM,
keyless Sigstore bundle, and GitHub build-provenance attestation. Fixed asset
names let the repository installer resolve the newest stable release without
calling the GitHub API. The separate `Release Staging` workflow remains useful
for unsigned, unpublished candidate bundles.

Linux releases also contain `amd64` and `arm64` Debian packages. These packages
are signed and attested release artifacts intended for Elixpo's signed APT
repository at `packages.elixpo.com`. They are not represented as packages from
the official Debian archive. Official Debian inclusion is tracked separately
because Debian must rebuild Crumb from source against archive-packaged Rust
dependencies. See the [Debian packaging notes](debian-packaging.md) for the
current dependency audit and archive-submission sequence.

## Install and uninstall

Linux and macOS install into `$HOME/.local/bin` unless `CRUMB_INSTALL_DIR` is
set:

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://raw.githubusercontent.com/elixpo/crumb.elixpo/main/install.sh | sh
```

Pin an exact release with `CRUMB_VERSION`, for example:

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://raw.githubusercontent.com/elixpo/crumb.elixpo/main/install.sh |
  CRUMB_VERSION=v1.0.4 sh
```

Windows installs into `%LOCALAPPDATA%\Programs\Crumb\bin` and adds that
directory to the user PATH:

```powershell
irm https://raw.githubusercontent.com/elixpo/crumb.elixpo/main/install.ps1 | iex
```

Uninstall by deleting the installed `crumb` or `crumb.exe`. On Windows, remove
the Crumb bin directory from the user PATH if it is no longer needed. User data
under `.crumb` and the OS credential store is deliberately not deleted with the
binary.

## Publishing

Publishing is manual. Dispatch `Publish Release` from `main` with `publish`
disabled to exercise every build and retain the verified artifacts without
creating a release. For publication, provide a version matching the Cargo
workspace version, enable `publish`, type `RELEASE`, and approve the protected
`production-release` environment. Ordinary pushes and tags cannot publish. The
workflow creates the tag and GitHub Release only after all target builds,
checksums, SBOMs, signatures, and attestations succeed.

macOS architectures are distributed separately. The installer selects the
matching archive; neither archive is advertised as universal.

## Publication gate

A maintainer may publish only after all of the following are true:

- terminal parity tests cover foreground interruption, resize, alternate
  screens, prompts, pagers, background output, and persistent shell state;
- Windows Authenticode and Apple Developer ID/notarization credentials are
  configured in protected environments before a stable platform-native signed
  release is advertised;
- clean install, upgrade, rollback, uninstall, PATH, and launcher tests pass on
  every supported platform;
- the security review and migration/rollback policy are approved;
- signed updater metadata and its revocation procedure are tested; and
- a maintainer explicitly approves the protected publish job.

Until native platform credentials and install/upgrade/rollback checks are
approved, releases remain clearly marked as prereleases. The website must not
present staging bundles as supported downloads.

## Verification

The one-line installers always verify the adjacent SHA-256 file. For stronger
provenance verification, download an archive and its `.sigstore.json` bundle,
then verify the GitHub Actions identity with Cosign:

```bash
cosign verify-blob \
  --bundle crumb-linux-x86_64.tar.gz.sigstore.json \
  --certificate-identity-regexp \
    'https://github.com/elixpo/crumb.elixpo/.github/workflows/release.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  crumb-linux-x86_64.tar.gz
```

## Desktop direction

The CLI and native Rust harness own tools, permissions, sessions, memory, and
execution policy. A future Tauri desktop app may be a thin frontend over a
UI-neutral runtime/event API. It must not fork or replace the harness. This
keeps one security boundary while allowing desktop-only conveniences such as
image clipboard access, drag and drop, previews, and session browsing later.
