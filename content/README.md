# Elixpo content registry

This directory is the canonical data layer for organization facts. Presentation code, READMEs, sitemaps, and future standalone surfaces must consume or validate against these records instead of maintaining independent project lists.

## Current files

- `organization.json` — canonical identity, positioning, URLs, and programme names.
- `taxonomy.json` — controlled public families and status vocabularies.
- `repositories.json` — complete repository custody and lifecycle inventory, including historical tombstones.
- `directory.json` — public names, descriptions, focus areas, evidence links, websites, and display metadata for every public catalog entry.
- `packages.json` — verified Linux application and npm package metadata, including versions, sources, installation commands, licenses, maintainers, and release state.
- `research.json` — research-specific abstracts, authors, publication and review status, artifacts, demonstrations, licenses, citations, and reproducibility records.
- `licensing.json` — approved defaults for new work and migration safeguards for existing work.
- `repository-licenses.json` — current repository-level license detection, controlling evidence links, and explicit missing/custom-license warnings for every public dossier.
- `sponsorship.json` — monetary no-solicitation boundary, project-owned funding separation, and in-kind event-partnership rules.
- `contributors.json` — dated, evidence-linked non-lead contributor recognition records and audit methodology.
- `people.json` — current organization roles, role definitions, evidence and consent boundaries, and explicit maintainer, alumni, and advisor records.
- `discussions.json` — verified GitHub Discussions source, eligible public categories, refresh policy, and editorial-feature boundary.
- `history.json` — institutional timeline copy, designed to grow only through verifiable milestones.
- `brand.json` — canonical public asset location, visual direction, palette, source inventory, duplicate audit, migration exclusions, and branding-migration state.
- `schemas/project-manifest.schema.json` — pilot contract for repository-owned `.elixpo/project.yml` manifests.
- `schemas/*.schema.json` — machine-readable contracts for canonical organization, directory, people, history, brand, policy, taxonomy, and repository records.

The human-readable repository contract and adoption templates live under
[`docs/repository-standard/`](../docs/repository-standard/).
The human-readable licensing direction lives at
[`docs/policies/licensing.md`](../docs/policies/licensing.md).
Trademark and referential brand-use boundaries live at
[`docs/policies/trademark-and-brand-use.md`](../docs/policies/trademark-and-brand-use.md).
People and profile publication consent is defined at
[`docs/policies/people-and-profile-consent.md`](../docs/policies/people-and-profile-consent.md).
The human-readable sponsorship policy lives at
[`docs/policies/sponsorship.md`](../docs/policies/sponsorship.md).
The portal-hosted canonical brand masters live under
[`public/brand/source/`](../public/brand/source/). Printable sticker masters,
sticker prompts, and production tooling intentionally remain in a restricted
private production workspace; only watermarked sticker previews are public.
The approved organization-wide visual rules are documented in
[`docs/brand-system.md`](../docs/brand-system.md).
The staged, history-preserving consolidation procedure is documented in
[`docs/brand-migration.md`](../docs/brand-migration.md).

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
