# Debian packaging

Crumb has two Debian distribution tracks. They are deliberately separate.

## Elixpo APT repository

Protected Crumb releases build `amd64` and `arm64` `.deb` files for Elixpo's
signed repository at `https://packages.elixpo.com/apt/`. Those packages make
Crumb convenient to install, but they are not packages from Debian's archive.

## Official Debian archive

The root `debian/` directory is a policy-oriented source package for Debian.
It builds Crumb from Debian-provided Rust crates without network access. The
package uses this explicit Cargo profile:

```bash
cargo build -p crumb-cli --no-default-features --features debian
```

The normal upstream release still enables bundled SQLite, native keyring
storage, and Sigstore verification by default. The Debian profile instead:

- links to Debian's system SQLite;
- reads provider credentials from environment variables;
- retains the bundled, audited skill catalogue; and
- refuses remote Sigstore verification because that verifier is not compiled
  into the Debian build.

Requests for unavailable integrations fail explicitly. They do not downgrade
to unverified remote installation or silently store credentials elsewhere.

## Dependency boundary

The initial full-feature graph had 14 absent and seven incompatible direct
external dependencies in Debian unstable. Feature isolation reduced the
Debian profile to 29 direct external crates. The audit on 19 October 2026 found
28 represented by compatible packages in unstable and one missing crate:

```text
reedline 0.52.1
```

Run the recorded boundary check with:

```bash
python3 scripts/check-debian-dependencies.py
```

The check fails if a second dependency disappears, becomes incompatible, or
if the expected `reedline` blocker changes without an intentional update.

## Packaging reedline

`reedline` is an ordinary Rust library used by Crumb's interactive terminal.
It should be introduced through the Debian Rust Team's `debcargo-conf`
workflow before the Crumb source package is submitted. Coordinate the work on
`debian-rust@lists.debian.org`; regular Rust crate packaging normally does not
need a separate WNPP ITP.

A local `debcargo 2.8.2` generation completed successfully, and an independent
`cargo debstatus` audit found no missing or incompatible transitive dependency
for reedline's no-default-feature graph. The reviewed starter overlay lives in
`packaging/debian/reedline/`.

Once `librust-reedline-dev` is available in unstable, rerun the dependency
check and change `EXPECTED_MISSING` to an empty set. Do not vendor the crate in
the Crumb source package merely to bypass Debian review.

## Source-package files

The `debian/` directory includes source and binary metadata, an offline Cargo
build, a manual page, a smoke autopkgtest, machine-readable copyright data,
and upstream watch and metadata files.

The placeholder bug number in `debian/changelog` must be replaced with the ITP
number before upload. The source package should then be maintained in a Debian
packaging repository (normally Salsa), with its Vcs fields added to
`debian/control`.

## Rust Team request

Send a concise dependency request from the identity that will maintain the
package:

```text
Subject: RFP/help packaging rust-reedline 0.52.1 for Crumb

Hello Debian Rust Team,

I am preparing Crumb, an MIT-licensed self-hosted agent harness and
natural-language terminal, for Debian:

  https://github.com/elixpo/crumb.elixpo

Crumb's Debian-specific feature graph builds against compatible packages in
unstable except for reedline 0.52.1. The application keeps its 29 internal
workspace crates in one source package and uses reedline without optional
features.

Could I coordinate packaging rust-reedline 0.52.1 in debcargo-conf with the
team? I am prepared to maintain the crate and test Crumb's fully offline source
build once it enters unstable.

Thank you,
Ayushman Bhattacharya
https://crumb.elixpo.com
```

## Archive submission sequence

1. Coordinate and land `rust-reedline` through the Debian Rust Team.
2. Search WNPP and run `wnpp-check crumb` for an existing application effort.
3. File `ITP: crumb -- self-hosted agent harness and natural-language terminal`
   against `wnpp` using `reportbug`; the prepared body is in
   `docs/development/debian-itp.txt`.
4. Replace `#nnnnnn` in `debian/changelog` with the ITP bug number.
5. Create a signed source package and build it in a clean, network-isolated
   unstable environment.
6. Run `lintian`, `autopkgtest`, `piuparts`, and `sbuild`.
7. Upload the signed source package to `mentors.debian.net` and file an RFS
   against `sponsorship-requests`.
8. Respond to sponsor and FTP NEW review.

Do not announce Crumb as being in Debian until the package clears Debian's NEW
queue and appears in the official archive.
