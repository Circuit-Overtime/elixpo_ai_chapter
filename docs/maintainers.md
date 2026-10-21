# Development and repository maintenance

This is the technical guide for the `elixpo/packages.elixpo` monorepo. The public-facing [README](../README.md) covers choosing and installing the applications.

## Applications

| Application | Package | Source | Install page |
| --- | --- | --- | --- |
| Win Dot Panel | `win-dot-panel` | [`apps/win-dot-panel`](../apps/win-dot-panel) | [packages.elixpo.com/win-dot-panel](https://packages.elixpo.com/win-dot-panel/) |
| ScreenBridge | `screenbridge` | [`apps/screenbridge`](../apps/screenbridge) | [packages.elixpo.com/screenbridge](https://packages.elixpo.com/screenbridge/) |
| Crumb | `crumb` | [`elixpo/crumb.elixpo`](https://github.com/elixpo/crumb.elixpo) | [packages.elixpo.com/crumb](https://packages.elixpo.com/crumb/) |

Win Dot Panel and ScreenBridge are released from this repository. Crumb is
released from its dedicated repository. All three are published through one
signed APT source and retain independent versions and Debian revisions.

## Repository structure

```text
apps/
├── win-dot-panel/          Win Dot Panel source, tests, and Debian builder
└── screenbridge/           ScreenBridge source, tests, and Debian builder
docs/
└── apt-repository.md       Repository operations and secret setup
scripts/
├── build_apt_repo.sh       Builds and signs the combined APT index
├── check_site.py           Validates public pages and crawler metadata
└── prepare_site.py         Renders product-specific installers
tests/                      Shared package-site tests
content/                    Canonical package-registry snapshot
public/                     Static response headers
src/                        Next.js catalogue and package records
web/                        Stable installer template and legacy assets
packages.toml               Package and release registry
```

ScreenBridge was imported as a non-squashed Git subtree. Its original commits remain ancestors of `main`, and its historical tags use the `screenbridge/` namespace.

## Install

ScreenBridge:

```bash
curl -fsSL -o /var/tmp/screenbridge-install.sh \
  https://packages.elixpo.com/screenbridge/install.sh && \
bash /var/tmp/screenbridge-install.sh
```

Win Dot Panel:

```bash
curl -fsSL -o /var/tmp/win-dot-panel-install.sh \
  https://packages.elixpo.com/win-dot-panel/install.sh && \
bash /var/tmp/win-dot-panel-install.sh
```

The installers verify the repository signing fingerprint, register the shared source once, and install only the selected package.

Crumb:

```bash
curl -fsSL -o /var/tmp/crumb-install.sh \
  https://packages.elixpo.com/crumb/install.sh && \
bash /var/tmp/crumb-install.sh
```

## Development

Each application is self-contained:

```bash
cd apps/win-dot-panel
python -m pip install -e '.[dev]'
python -m pytest -q
```

```bash
cd apps/screenbridge
python -m unittest discover -s tests -v
./packaging/build-deb.sh --revision 1
```

Build, prepare, and validate the public site:

```bash
npm ci
npm run registry:check
npm run lint
npm run typecheck
npm run build
python scripts/prepare_site.py /tmp/elixpo-package-site
python scripts/check_site.py /tmp/elixpo-package-site
```

## Releases

Repository-owned applications use product-prefixed tags:

```text
win-dot-panel/v1.0.0-10
screenbridge/v1.0.0-2
```

Each repository-owned release workflow tests its application, builds a revisioned Debian package, publishes checksums, and invokes the shared package-site deployment. Crumb's protected release publishes separate `amd64` and `arm64` packages from `elixpo/crumb.elixpo`. The deployment downloads every declared stable release, verifies it, rebuilds the combined index, signs it with the organization-managed `APT_SIGNING_KEY`, and deploys the catalogue and repository atomically. GitHub Pages remains production during the Cloudflare candidate period.

See [APT repository operations](apt-repository.md) for signing, secrets, deployment, and recovery procedures.

## License

Repository automation and ScreenBridge use the MIT License. Win Dot Panel uses MIT-licensed application code and Unicode License v3 data; its complete license information is in [`apps/win-dot-panel`](../apps/win-dot-panel).
