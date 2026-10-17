# Elixpo licensing direction

**Status:** Published operating policy; repository migrations remain artifact-specific

**Last verified:** 2026-10-17
**Machine-readable source:** [`content/licensing.json`](../../content/licensing.json)

Elixpo publishes different kinds of work. Code, papers, hardware designs,
datasets, model weights, brand assets, and operated services do not share one
automatic license.

## Current rule

The terms in the owning repository or artifact record control. No
organization-wide license grant should be inferred from the Elixpo name, a
project listing, or another repository's license.

Existing work will not be silently relicensed. A migration requires evidence
that the project has authority to change the terms and that contributor and
upstream rights are respected.

## Defaults for new Elixpo-owned work

| Artifact | Direction |
| --- | --- |
| Source code | MIT by default; Apache-2.0 when its express patent grant is materially useful. |
| Papers and general documentation | CC BY 4.0. |
| Hardware design sources | CERN-OHL-S-2.0. |
| Datasets | Select per artifact after provenance, consent, privacy, and upstream review. |
| Models, weights, and checkpoints | Select per artifact after training-data, upstream-model, and distribution review. |
| Brand assets and stickers | Public colour, typography, and usage guidance; watermarked sticker previews only, with print-ready access limited to approved written event partnerships. |

These are defaults for new work, not a declaration that existing repositories
already use them.

## Member Projects and transferred repositories

A Member Project keeps its existing license when it joins Elixpo. Moving a
repository into the organization does not give Elixpo permission to relicense
past contributions and does not remove the original maintainer's documented
project authority.

Any proposed migration must identify:

- the copyright holders or other authority supporting the change;
- whether contributor consent is required and how it is obtained;
- upstream code, assets, data, models, fonts, and hardware sources;
- the exact artifacts covered by each license; and
- the maintainer who approved the final result.

## Open-source descriptions

Elixpo uses “open source” for artifacts that actually carry an appropriate
open-source license. Competitive-use, field-of-use, royalty, non-commercial,
or similar restrictions must be disclosed and must not be presented as
ordinary MIT, Apache, or universally open-source terms.

Official package names, marketplace publisher identities, domains, hosted
deployments, signing keys, production data, and operational credentials are
not transferred merely because their source code is available.

## Trademark boundary

Copyright permission and trademark permission are separate. A source or asset
license does not automatically grant a right to impersonate Elixpo, claim
endorsement, or control official names, domains, registry identities, or
distribution accounts.

The published [trademark and brand-use policy](trademark-and-brand-use.md)
permits narrow, accurate referential use while reserving official identity,
co-branding, merchandise, sticker production, and uses that imply endorsement.
Public colour tokens, typography guidance, and general usage guidance may be
consulted openly. Official sticker previews do not grant reproduction, printing,
distribution, modification, or resale permission. Print-ready sticker material
is released only under the written terms of an approved event partnership.

## Existing unclear or missing licenses

Repositories with missing, custom, mixed, or unrecognized terms are preserved
without making a reuse claim. Archived repositories remain historical records;
archival does not create a license.

This direction is an operational publishing policy, not legal advice to
contributors or downstream users.
