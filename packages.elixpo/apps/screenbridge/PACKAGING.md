# Packaging and releases

This document is for maintainers. The public README intentionally stays non-technical.

## Build a Debian package

```bash
./packaging/build-deb.sh --revision 1
```

The package is written to `dist/screenbridge_VERSION-REVISION_all.deb`. The builder validates the desktop and AppStream metadata when their validators are installed.

## Test the package locally

```bash
sudo apt install ./dist/screenbridge_1.0.0-1_all.deb
```

## Publish a release

The shared release workflow runs for tags beginning with `screenbridge/v`. The tag must match the version in `screenbridge/__init__.py`.

```bash
git tag -a screenbridge/v1.0.0-2 -m "ScreenBridge 1.0 Aurora, Debian revision 2"
git push origin screenbridge/v1.0.0-2
```

GitHub Actions runs the tests, builds the Debian package, creates checksums, publishes the versioned asset, and then rebuilds `packages.elixpo.com` from the latest stable release of each product.

The installer is published at `https://packages.elixpo.com/screenbridge/install.sh`. Application sources, release assets, package-site sources, and deployment workflows all live in `elixpo/packages.elixpo`.

The repository needs only the `APT_SIGNING_KEY` Actions secret. No cross-repository deployment token is required.
