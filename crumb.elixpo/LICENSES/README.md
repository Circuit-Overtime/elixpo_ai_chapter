# LICENSES - directory layout

This directory holds the canonical license texts and third-party notices used
by Crumb. The top-level [`LICENSE`](../LICENSE) explains which standard license
applies to each class of material. The structure mirrors the Linux kernel's
`LICENSES/` tree so Elixpo repositories use a consistent layout.

## Subdirectories

```
preferred/    Licenses that contributions should use.
              Code defaults to MIT; brand/visual assets to CC-BY-4.0.

exceptions/   Historical compatibility notes. Crumb does not use a custom
              SPDX exception.

notices/      Third-party attributions (the upstream credit list).
```

## Index

| Path                            | SPDX ID            | Used for                                              |
|---------------------------------|--------------------|------------------------------------------------------|
| `preferred/MIT`                 | `MIT`              | All source code in the repository.                   |
| `preferred/CC-BY-4.0`           | `CC-BY-4.0`        | Brand and visual assets.                             |

Trademark and source-identity rules are maintained separately in the root
`TRADEMARKS.md`; they are not SPDX licence exceptions and do not modify the
copyright permissions above.

## The notice board

Per-product reservations (an exclusive npm package, VS Code extension, hosted
SaaS, paid tier, etc.) are NOT placed here. They go in the root
[`NOTICE`](NOTICE) file - the "notice board" - which is read together with
the LICENSE.

## Contributions

By submitting a pull request you agree your contribution is licensed inbound
under this standard (MIT for code, CC-BY-4.0 for assets) and that you have the
right to submit it. The
[Developer Certificate of Origin](https://developercertificate.org) applies to
every commit. We do not require a CLA.
