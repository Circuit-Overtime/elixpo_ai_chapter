# Debian packaging

Crumb has two Debian distribution tracks. They are deliberately separate.

## Elixpo APT repository

Protected Crumb releases build `amd64` and `arm64` `.deb` files for Elixpo's
signed repository at `https://packages.elixpo.com/apt/`. Those packages make
Crumb convenient to install, but they are not packages from Debian's archive.
They are built by `packaging/debian/build-deb.sh` in the release workflow.

## Official Debian archive

The Debian source package is maintained on Salsa, not in this repository:

```text
https://salsa.debian.org/elixpo/crumb
```

That repository follows the DEP-14 layout used by `git-buildpackage`:
`debian/latest` holds the packaging, while `upstream/latest` and
`pristine-tar` hold imported release tarballs. Each Debian upload is based on
a tagged GitHub release, which `debian/watch` finds through `uscan`. Upstream
does not ship a `debian/` directory, so the two cannot drift apart.

The Debian build uses this explicit Cargo profile:

```bash
cargo build -p crumb-cli --no-default-features --features debian
```

The `debian` feature first appears in Crumb 1.0.4; earlier release tarballs
cannot be built by the Debian package. The normal upstream release still
enables bundled SQLite, native keyring storage, and Sigstore verification by
default. The Debian profile instead:

- links to Debian's system SQLite;
- reads provider credentials from environment variables;
- retains the bundled, audited skill catalogue; and
- refuses remote Sigstore verification because that verifier is not compiled
  into the Debian build.

Requests for unavailable integrations fail explicitly. They do not downgrade
to unverified remote installation or silently store credentials elsewhere.

## Dependency boundary

The Debian profile uses 29 external crates across the complete dependency
graph. The audit on 19 October 2026 found 28 represented by compatible
packages in unstable and one missing crate:

```text
reedline 0.52.1
```

Run the recorded boundary check with:

```bash
python3 scripts/check-debian-dependencies.py
```

The check fails if a second dependency disappears, becomes incompatible, or
if the expected `reedline` blocker changes without an intentional update.
Once `librust-reedline-dev` is available in unstable, change
`EXPECTED_MISSING` to an empty set. Do not vendor the crate in the Crumb
source package to bypass Debian review.

## reedline

`reedline` is packaged by the Debian Rust Team in `debcargo-conf`. The
existing unreleased 0.48.0 overlay was updated to 0.52.1 in
[merge request !1493](https://salsa.debian.org/rust-team/debcargo-conf/-/merge_requests/1493),
with Ayushman Bhattacharya added to its uploaders. The clean unstable build,
autopkgtest, and lintian checks passed, and the RFS marker is in place. A Rust
Team sponsor runs `release.sh` and uploads it; it then passes through NEW.

## ITP status

The ITP was accepted by the Debian BTS on 19 October 2026 as
[#1151280](https://bugs.debian.org/1151280). The submitted message is retained
in `docs/development/debian-itp.txt` for packaging history. Further ITP
correspondence belongs at `1151280@bugs.debian.org`. The draft sponsorship
request is in `docs/development/debian-rfs.txt`.

## Archive submission sequence

1. Land `rust-reedline` through the Debian Rust Team.
2. Import the 1.0.4 release into the Salsa repository.
3. Build the signed source package in a clean, network-isolated unstable
   environment.
4. Run `lintian`, `autopkgtest`, `piuparts`, and `sbuild`.
5. Upload the signed source package to `mentors.debian.net` and file an RFS
   against `sponsorship-requests`.
6. Respond to sponsor and FTP NEW review.

Do not announce Crumb as being in Debian until the package clears Debian's NEW
queue and appears in the official archive.
