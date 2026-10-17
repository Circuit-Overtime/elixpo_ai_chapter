# LICENSES - directory layout

This directory holds the canonical license texts and exception clauses that
make up the **Elixpo licensing standard**. The top-level [`LICENSE`](../LICENSE)
file is the pointer; the real texts live here. The structure mirrors the Linux
kernel's `LICENSES/` tree, so every Elixpo repository looks the same.

## Subdirectories

```
preferred/    Licenses that contributions should use.
              Code defaults to MIT; brand/visual assets to CC-BY-4.0.

exceptions/   Project-specific clauses that modify or qualify a preferred
              license. Reference them via `WITH` in the
              SPDX-License-Identifier line of affected files.

notices/      Third-party attributions (the upstream credit list).
```

## Index

| Path                            | SPDX ID            | Used for                                              |
|---------------------------------|--------------------|------------------------------------------------------|
| `preferred/MIT`                 | `MIT`              | All source code in the repository.                   |
| `preferred/CC-BY-4.0`           | `CC-BY-4.0`        | Brand and visual assets (`brand/`, `public/brand/`). |
| `exceptions/Oreo-trademarks`    | `Oreo-trademarks`  | Reserves Elixpo/Oreo names, mascot, and royalties.   |

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
