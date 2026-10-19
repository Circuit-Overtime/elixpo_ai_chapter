# Contributing to Elixpo Packages

Elixpo Packages contains application source, Debian builders, a signed APT
repository pipeline, and the public package catalogue. Start by opening an
issue for changes that affect package identity, installation, signing, release
automation, supported platforms, or public metadata.

## Local checks

Frontend changes:

```bash
npm ci
npm run registry:check
npm run lint
npm run typecheck
npm run build
python scripts/prepare_site.py /tmp/elixpo-package-site
python scripts/check_site.py /tmp/elixpo-package-site
```

Repository tooling:

```bash
python -m pip install 'pytest>=8' 'ruff>=0.6,<1'
ruff check scripts tests
ruff format --check scripts tests
python -m pytest -q tests
```

Application-specific commands remain in `docs/maintainers.md` and each
application README. Do not commit signing keys, release downloads, generated
APT indexes, local build outputs, or credentials.

## Pull requests

Describe the affected application or publication route, user-visible behavior,
compatibility implications, checks run, and rollback path. Package and signing
changes require maintainer review. Public claims must be supported by source,
release, or test evidence.
