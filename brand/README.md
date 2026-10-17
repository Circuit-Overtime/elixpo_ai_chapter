# Elixpo brand source

This directory documents how Elixpo's public identity is produced and governed.
The canonical downloadable public library is served from
[`public/brand/`](../public/brand/) and described at
[`https://elixpo.com/assets`](https://elixpo.com/assets).

## Public material

- `public/brand/source/marks/` contains reviewed organization marks.
- `public/brand/source/icons/` contains reviewed project and service icons.
- `public/brand/source/social/` contains reviewed social masters.
- `public/brand/stickers/previews/` contains visibly watermarked display
  previews only.
- `MASCOT.md` and [`docs/brand-system.md`](../docs/brand-system.md) define the
  approved Oreo and Open Field visual rules.
- `provenance.json` records the source revision, source paths, checksums, and
  migration classification of imported public material.

Public colour, typography, accessibility, and general usage guidance may be
used as documented. A public mark or preview does not grant a right to imply
Elixpo endorsement, impersonate an official account, or distribute protected
event material.

## Restricted production material

Print-ready sticker artwork, sticker sheets, unwatermarked exports, sticker
generation prompts, and production tooling are not part of the public brand
library. They are retained in the active private `brand-production` workspace
so maintainers can create future material without exposing printable sponsor
assets.

Approved community partners may request physical sticker packs or scoped
print-ready material through [`/partnerships`](https://elixpo.com/partnerships).
Permission is recorded in writing for the agreed event and does not create a
general reproduction or distribution grant.

## Adding or changing an asset

1. Confirm ownership, upstream sources, and artifact-specific licensing.
2. Review the asset against the Open Field and Oreo rules.
3. Add the public master or optimized derivative to the appropriate
   `public/brand/` directory.
4. Record its source revision, original path, checksum, classification, and
   license notice in `provenance.json`.
5. Verify dimensions, transparency, alternative text, contrast, and every
   consuming route before replacing an existing canonical file.

Never commit credentials, decrypted configuration, private event agreements,
or restricted production artwork to this public repository.
