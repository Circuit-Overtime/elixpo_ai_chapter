# Elixpo content registry

This directory is the canonical data layer for organization facts. Presentation code, READMEs, sitemaps, and future standalone surfaces must consume or validate against these records instead of maintaining independent project lists.

## Current files

- `organization.json` — canonical identity, positioning, URLs, and programme names.
- `taxonomy.json` — controlled public families and status vocabularies.
- `repositories.json` — complete repository custody and lifecycle inventory, including historical tombstones.
- `directory.json` — public names, descriptions, focus areas, evidence links, websites, and display metadata for every public catalog entry.
- `packages.json` — verified Linux application and npm package metadata, including versions, sources, installation commands, licenses, maintainers, and release state.
- `licensing.json` — approved defaults for new work and migration safeguards for existing work.
- `sponsorship.json` — monetary no-solicitation boundary, project-owned funding separation, and in-kind event-partnership rules.
- `contributors.json` — dated, evidence-linked non-lead contributor recognition records and audit methodology.
- `history.json` — institutional timeline copy, designed to grow only through verifiable milestones.
- `brand.json` — canonical public asset location, visual direction, palette, and branding-migration state.
- `schemas/project-manifest.schema.json` — pilot contract for repository-owned `.elixpo/project.yml` manifests.
- `schemas/*.schema.json` — machine-readable contracts for canonical organization, directory, people, history, brand, policy, taxonomy, and repository records.

The human-readable repository contract and adoption templates live under
[`docs/repository-standard/`](../docs/repository-standard/).
The human-readable licensing direction lives at
[`docs/policies/licensing.md`](../docs/policies/licensing.md).
The human-readable sponsorship policy lives at
[`docs/policies/sponsorship.md`](../docs/policies/sponsorship.md).
The portal-hosted canonical brand masters live under
[`public/brand/source/`](../public/brand/source/); production pipelines,
prompts, and the large sticker archive have not yet migrated.

Canonical shared README prose and repository wrappers live under `readme/`.
Generated artifacts under `docs/readme/generated/` are synchronized to the
portal README, organization profile, and Chapter README. Do not edit text
between the generated markers in a downstream repository.

## Verification model

Repository records use three verification states:

- `verified` — the record and its special handling have been checked.
- `decision-recorded` — the maintainer supplied the strategic classification, but detailed fields such as license, maintainer list, maturity, or deployment still require evidence.
- `needs-decision` — publication-blocking facts remain unresolved and are listed in `pendingDecisions`.

A record with `needs-decision` must never be emitted into public project, research, service, README, sitemap, or structured-data output.

## Ownership rules

- Canonical facts live here.
- Repository manifests may supply repository-owned technical facts later.
- Elixpo owns editorial descriptions and public classification.
- Every lifecycle value carries `statusOwner` and `statusVerifiedAt`.
- Claims about releases, people, history, recognition, review, or impact require evidence URLs in their eventual public records.

## Validation

Run the lightweight registry check with:

```bash
npm run registry:check
```

It uses only Node.js built-ins and does not install packages, start Next.js, or perform a production build.
