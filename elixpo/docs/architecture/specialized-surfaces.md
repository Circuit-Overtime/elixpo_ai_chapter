# Specialized surface maintenance contract

**Status:** Adopted direction; `research.elixpo` implementation pending  
**Canonical organization registry:** `elixpo/elixpo`  
**Last reviewed:** 2026-10-16

Elixpo uses separate repositories for research publishing and package
distribution because those surfaces have different release processes,
technical requirements, and operational risks. Separate deployment does not
mean separate organizational truth.

## Ownership boundaries

| Surface | Owns | Does not own |
| --- | --- | --- |
| `elixpo.com` | Organization taxonomy, public lifecycle, stewardship relationship, directory copy, canonical cross-links, and shared schema contracts | Paper source, package binaries, project source code, or independent duplicate catalogues |
| `research.elixpo.com` | Research publication UI, publication manifests, citations, paper presentation, artifact links, and reproducibility presentation | Project governance, unsupported peer-review claims, or the primary experimental repository |
| `packages.elixpo.com` | Package builds, signed APT metadata, installers, checksums, release artifacts, distribution documentation, and package operations | Organization-wide project status or source-project governance |
| Project repositories | Source code, experiments, raw evidence, project releases, licenses, maintainers, and technical documentation | Organization-wide classification or editorial feature placement |

## Synchronization contract

1. Every specialized record must identify its owning repository and matching
   Elixpo registry slug.
2. Organization classification and lifecycle changes begin in the portal
   registry and are reviewed there.
3. Research and package facts produced by their owning repositories are
   synchronized through a validated manifest or a reviewable pull request.
4. Synchronization failures must fail visibly. A site must keep its last
   verified record rather than publish partially updated metadata.
5. Canonical URLs are declared once. The portal may publish a discovery dossier
   while a specialized site owns the complete publication or distribution page.
6. No workflow may push directly across repositories without least-privilege
   credentials, validation, and a human-review path.

## Canonical URL policy

- `elixpo.com/research` remains the organization research directory.
- Once launched, full research publications use
  `research.elixpo.com/<slug>` as their publication canonical URL.
- `elixpo.com/research/<slug>` remains a concise organizational dossier and
  links to the full publication without copying the whole paper page.
- `elixpo.com/packages` remains the organization package index.
- `packages.elixpo.com/<package>` remains the operational installation and
  distribution authority.
- Portal package dossiers summarize verified release information and link to
  the distribution authority.

## Repository independence

The specialized repositories may choose their own framework, deployment
provider, testing strategy, and release cadence. They must still implement the
shared metadata schema, accessibility baseline, canonical-link policy, and
Elixpo navigation contract. The main portal should remain deployable when a
specialized service is temporarily unavailable.
