# Elixpo Packages

Elixpo Packages is the source, release, and signed distribution repository for
focused Elixpo Linux applications. It also publishes the standalone package
catalogue at [packages.elixpo.com](https://packages.elixpo.com), where Linux and
developer packages remain connected to source, versions, licenses, installers,
and support records.

## Published applications

| Application | Purpose | Current package route |
| --- | --- | --- |
| [Win Dot Panel](apps/win-dot-panel) | Emoji, symbols, kaomoji, and private clipboard history | [packages.elixpo.com/win-dot-panel](https://packages.elixpo.com/win-dot-panel/) |
| [ScreenBridge](apps/screenbridge) | Share computer audio while retaining separate microphone control | [packages.elixpo.com/screenbridge](https://packages.elixpo.com/screenbridge/) |
| [Crumb](https://github.com/elixpo/crumb.elixpo) | Self-hosted agent harness and natural-language terminal | [packages.elixpo.com/crumb](https://packages.elixpo.com/crumb/) |

All packages use independently versioned releases and one signed APT source.
Their installers verify the repository key before configuring it. Crumb keeps
its source and cross-platform releases in its dedicated repository; this
repository publishes the verified Debian artifacts through APT.

## Install

Win Dot Panel:

```bash
curl -fsSL -o /var/tmp/win-dot-panel-install.sh \
  https://packages.elixpo.com/win-dot-panel/install.sh && \
bash /var/tmp/win-dot-panel-install.sh
```

ScreenBridge:

```bash
curl -fsSL -o /var/tmp/screenbridge-install.sh \
  https://packages.elixpo.com/screenbridge/install.sh && \
bash /var/tmp/screenbridge-install.sh
```

Crumb:

```bash
curl -fsSL -o /var/tmp/crumb-install.sh \
  https://packages.elixpo.com/crumb/install.sh && \
bash /var/tmp/crumb-install.sh
```

Review an installer and the relevant application source before running software
with system privileges.

## Repository structure

```text
apps/                       Application source, tests, and package builders
content/                    Reviewed snapshot of canonical Elixpo package metadata
docs/                       Package operations and maintainer documentation
public/                     Static response headers for the publication surface
scripts/                    Registry, site, installer, and APT assembly tooling
src/                        Static Next.js package catalogue
tests/                      Shared package and repository tests
web/                        Stable legacy assets and installer template
packages.toml               Linux release namespace and artifact registry
```

The main Elixpo registry owns organization-level package classification. This
repository owns application source, release artifacts, installers, signed APT
metadata, package-specific documentation, and the package publication UI.

## Development

Frontend:

```bash
npm ci
npm run registry:check
npm run lint
npm run typecheck
npm run build
python3 scripts/prepare_site.py /tmp/elixpo-package-site
python3 scripts/check_site.py /tmp/elixpo-package-site
```

Application and Python checks are documented in
[`docs/maintainers.md`](docs/maintainers.md).

The repository deployment helper follows the shared Elixpo interface:

```bash
./deploy.sh --pages build
./deploy.sh --pages build deploy
./deploy.sh --pages deploy --promote-domain
```

The final command is reserved for the custom-domain cutover after a candidate
deployment passes its remote smoke tests.

## Releases and deployment

Stable product tags use independent namespaces:

```text
win-dot-panel/v1.0.0-10
screenbridge/v1.0.0-2
```

Each product workflow builds and verifies its Debian package and checksums. The
deployment workflow then downloads the latest stable release for every
registered application, verifies package identity and checksums, builds one APT
index, signs the release metadata, and publishes the catalogue and repository as
one artifact.

GitHub Pages remains the production host during the Cloudflare migration. The
manual Cloudflare candidate workflow publishes the same artifact to the
`packages-elixpo` Pages project. The custom domain moves only after the candidate
passes route, installer, signature, and package-pool verification. Cloudflare
credentials are repository-scoped during this migration; the APT signing key
remains organization-managed.

See [`docs/apt-repository.md`](docs/apt-repository.md) for signing, release, and
recovery operations, and [`docs/cloudflare-pages.md`](docs/cloudflare-pages.md)
for candidate deployment, domain cutover, verification, and rollback.

## Participation and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Public support
boundaries are in [SUPPORT.md](SUPPORT.md), private vulnerability reporting is
defined in [SECURITY.md](SECURITY.md), and repository authority is recorded in
[GOVERNANCE.md](GOVERNANCE.md).

## License

Repository automation, the catalogue, and ScreenBridge use the MIT License. Win
Dot Panel includes MIT-licensed application code and Unicode data under the
Unicode License v3. See [NOTICE](NOTICE) and each application directory for the
complete terms.
