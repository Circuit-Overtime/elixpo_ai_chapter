# Signed multi-package APT repository

The package catalog is published at `https://packages.elixpo.com/`, with Win Dot Panel at `/win-dot-panel/`, ScreenBridge at `/screenbridge/`, and stable packages at `/apt/`. Both applications and their releases live in `elixpo/packages.elixpo`. The deployment workflow selects the latest stable namespaced release for each product, verifies both packages, builds one signed APT index, and deploys the site atomically through GitHub Pages.

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

The same source can install `screenbridge`; do not register the repository a second time. Existing installations using `win-dot-panel.list` remain valid, and a new product installer migrates that source to the generic filename.

## Publishing architecture

- `elixpo/packages.elixpo` owns both application sources, GitHub Releases, GitHub Pages, the custom domain, and `APT_SIGNING_KEY`.
- Stable package binaries use product-prefixed tags: `win-dot-panel/v...` and `screenbridge/v...`.
- `.github/workflows/deploy-packages.yml` verifies both releases, builds the shared index, signs it, and deploys one Pages artifact.
- Each stable product release invokes that shared deployment workflow directly.

## One-time maintainer setup

1. Keep GitHub Pages on **GitHub Actions** with the custom domain `packages.elixpo.com`.
2. Keep the existing `packages` CNAME pointed at the Pages host for the `elixpo` organization and retain the domain-verification TXT record.
3. In **Environments → github-pages**, allow `win-dot-panel/v*`, `screenbridge/v*`, and the `main` branch.
4. Keep `APT_SIGNING_KEY` in this repository's Actions secrets and maintain an offline backup of its private key.
5. Run **Deploy packages.elixpo.com** manually when either package release must be republished without a new tag.

## Release process

1. Publish application releases with tags matching `<product>/v<upstream-version>-<Debian-revision>`.
2. Let the application workflow upload its versioned `.deb` and `SHA256SUMS`.
3. The package-site workflow downloads the latest release for both products, verifies checksums and package identities, then signs and deploys the combined repository.
4. Confirm `/win-dot-panel/`, `/screenbridge/`, both installers, `/apt/InRelease`, `/apt/Packages.gz`, and both files under `/apt/pool/`.

The GitHub updater remains available for Win Dot Panel development builds.
