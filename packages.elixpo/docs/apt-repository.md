# Signed multi-package APT repository

The package catalog is published at `https://packages.elixpo.com/`, with Win Dot Panel at `/win-dot-panel/`, ScreenBridge at `/screenbridge/`, Crumb at `/crumb/`, and stable packages at `/apt/`. The Linux application sources and releases live in `elixpo/packages.elixpo`; Crumb's cross-platform source and release authority remain in `elixpo/crumb.elixpo`. The deployment workflow selects the declared stable releases, verifies every package, builds one signed APT index, and deploys the catalogue and repository as one artifact. GitHub Pages remains the production host while an equivalent Cloudflare Pages candidate is verified.

## Quick install

```bash
curl -fsSL -o /var/tmp/win-dot-panel-install.sh \
  https://packages.elixpo.com/win-dot-panel/install.sh && \
bash /var/tmp/win-dot-panel-install.sh
```

This checks the repository key fingerprint, registers the signed APT source, and installs the latest stable package. The current signing key fingerprint is `319D A9C9 E089 FAB1 264F 35F5 F8ED 950B 52AE 3CAB`.

The signing key was rotated on October 9, 2026 because the previous private key was unavailable. Systems configured before that date must rerun either product installer once to replace the repository key before running `sudo apt update`.

## Manual setup

```bash
sudo apt update
sudo apt install curl gnupg
sudo install -d -m 755 /etc/apt/keyrings
curl -fsSL -o /var/tmp/elixpo-packages.asc \
  https://packages.elixpo.com/apt/keyring.asc
sudo gpg --dearmor --yes -o /etc/apt/keyrings/elixpo-packages.gpg \
  /var/tmp/elixpo-packages.asc
echo 'deb [signed-by=/etc/apt/keyrings/elixpo-packages.gpg] https://packages.elixpo.com/apt/ ./' | \
  sudo tee /etc/apt/sources.list.d/elixpo-packages.list
sudo apt update
sudo apt install win-dot-panel
```

The same source can install `screenbridge` and `crumb`; do not register the repository a second time. Existing installations using `win-dot-panel.list` remain valid, and a new product installer migrates that source to the generic filename.

## Publishing architecture

- `elixpo/packages.elixpo` owns the Linux application sources, its namespaced releases, the signed APT index, publication workflows, and the custom-domain deployment contract. `elixpo/crumb.elixpo` owns Crumb's source and protected cross-platform release.
- `APT_SIGNING_KEY` is organization-managed. Cloudflare credentials are repository-scoped during the current migration and exposed only to trusted workflows.
- Stable package binaries use product-prefixed tags: `win-dot-panel/v...` and `screenbridge/v...`.
- Changes on `main` run the complete validation and package build, then retain
  the result as a workflow artifact. They do not create public GitHub Releases.
- Public GitHub Releases are created only from explicit product version tags.
  Historical `main-*` prereleases remain available as an audit record of the
  earlier policy but are not selected by either publication workflow.
- `.github/workflows/deploy-packages.yml` verifies every declared release, builds the shared index, signs it, and deploys one Pages artifact.
- Each stable product release invokes that shared deployment workflow directly.

## One-time maintainer setup

1. Keep GitHub Pages on **GitHub Actions** with the custom domain `packages.elixpo.com`.
2. Keep the existing `packages` CNAME pointed at the Pages host for the `elixpo` organization and retain the domain-verification TXT record.
3. In **Environments → github-pages**, allow `win-dot-panel/v*`, `screenbridge/v*`, and the `main` branch.
4. Grant this repository access to the organization-managed `APT_SIGNING_KEY` and maintain an offline backup of its private key.
5. Run **Deploy packages.elixpo.com** manually when either package release must be republished without a new tag. During migration, run **Deploy Cloudflare Pages candidate** separately and compare the complete artifact before moving DNS.

## Release process

1. Publish application releases with tags matching `<product>/v<upstream-version>-<Debian-revision>`.
2. Let the application workflow upload its versioned `.deb` and `SHA256SUMS`.
3. The package-site workflow downloads the declared releases, verifies checksums, architectures, and package identities, then signs and deploys the combined repository.
4. Confirm `/win-dot-panel/`, `/screenbridge/`, `/crumb/`, all installers, `/apt/InRelease`, `/apt/Packages.gz`, and the expected files under `/apt/pool/`.

The GitHub updater remains available for Win Dot Panel development builds.
