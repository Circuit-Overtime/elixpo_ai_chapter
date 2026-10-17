# Elixpo Repository Standard 1.0

**Status:** Current  
**Effective date:** 2026-10-17  
**Normative schema:** [`project-manifest.schema.json`](../../content/schemas/project-manifest.schema.json)  
**Migration version:** [0.1](elixpo-repository-standard-v0.1.md)

Repository Standard 1.0 turns the LixBlogs pilot into a stable organization
contract. It standardizes discoverability, evidence, contributor safety, and
operational boundaries while leaving project architecture and privileged
release processes under repository-maintainer control.

## Shared requirements

Every non-archived repository declaring 1.0 conformance MUST:

- publish `.elixpo/project.yml` with a canonical registry identity;
- identify one repository profile and its applicable artifact type;
- provide `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `SUPPORT.md`, and the repository's controlling `LICENSE`;
- identify accountable maintainers and link the public classification and
  license evidence used during verification;
- expose exact local lint, test, and build commands, using an empty string only
  when a check genuinely does not apply;
- keep fork pull requests secretless and read-only;
- use least-privilege workflow permissions, immutable third-party action
  references, bounded job timeouts, and concurrency cancellation where safe;
- retain deployment, package signing, payments, moderation, production data,
  and other privileged operations as repository-specific workflows; and
- record reviewed exceptions with an owner and review date.

AI or agent automation is optional and cannot be required to build, test,
review, release, secure, or govern a conformant repository.

## Repository profiles

| Profile | Required emphasis |
| --- | --- |
| `software` | Installation, architecture, supported runtime, deterministic checks, releases, and compatibility. |
| `hosted-service` | Public endpoint, operational owner, data/security boundary, deployment and rollback path, and support expectations. |
| `research` | Research status, authorship, review status, code/artifact links, citation, licenses, and reproducibility limits. |
| `package` | Package identities, supported platforms, install commands, source mapping, signatures/checksums where available, deprecation, and release policy. |
| `hardware` | Schematics/source formats, bill of materials, firmware/tooling, build or verification procedure, and hardware-specific licensing. |
| `archive` | Final status, historical purpose, last supported artifact, license reality, and an explicit no-support boundary. |

Profiles add requirements; they do not replace the shared baseline. A project
with several outputs chooses the profile for its primary operational burden and
documents secondary artifacts in its README and manifest.

## Manifest provenance

A 1.0 manifest MUST include:

- `provenance.classification_decision` — the reviewed lifecycle, family,
  custody, and relationship decision;
- `provenance.license_evidence` — the current repository-level license record;
- `provenance.status_checked_at` — the last UTC verification date;
- `project.profile`, `project.technologies`, and `project.chapter_status`; and
- `publication.canonical_url` — the stable Elixpo dossier or subject page.

Verification confirms the record; it does not imply peer review, permanent
maintenance, endorsement, certification, or permission beyond the controlling
license.

## Pull-request and branch governance

The organization baseline uses pull requests, resolved review conversations,
current required checks, squash-only history, blocked force-pushes, and blocked
branch deletion. The organization currently requires **zero mandatory human
approvals** by explicit maintainer decision. Individual repositories MAY
require approvals when their custody or risk demands it.

Stable check names MUST be chosen before rulesets depend on them. A migration
MUST preserve a rollback route and MUST NOT expose secrets to fork-controlled
code.

The versioned responsibility matrix is published in
[`workflow-responsibilities.md`](workflow-responsibilities.md). Its recurring
review schedule and rollback record satisfy the baseline without forcing every
repository to share privileged implementation details.

## Adoption and migration

Version 0.1 remains readable solely to make migrations reviewable. It is not
current conformance. Adoption of 1.0 requires:

1. verified canonical registry and license records;
2. a repository-specific audit;
3. a reviewable manifest and documentation diff;
4. deterministic checks plus documented privileged boundaries;
5. ordinary-branch, pull-request, fork, release, and intentional-failure tests
   where applicable; and
6. maintainer review or a recorded central-maintainer decision for an
   Elixpo-owned repository.

Bulk tooling may prepare branches and pull requests, but it must never silently
rewrite default branches or decide lifecycle, licensing, research claims, or
maintainer authority.

Archived and deleted repositories use a central archival-only baseline. Their
lifecycle, custody, support boundary, and observed license remain in the
canonical registry; their frozen default branches are not reopened merely to
add current templates. Restoration or renewed maintenance requires a fresh
repository-specific review.

The portal migration tool is dry-run by default, refuses dirty repositories,
does not overwrite current 1.0 manifests or existing policy documents, and
never creates a license. A verified missing-license record may be carried as a
dated, owned exception; this keeps the absence visible and does not grant reuse
permission or claim full legal conformance.

Preview and then explicitly write a selected migration batch:

```bash
npm run repository:migrate -- --repositories octabit qfabric Nano28C64
npm run repository:migrate -- --write --repositories octabit qfabric Nano28C64
```

Run the conformance audit from the portal checkout:

```bash
npm run repository:check -- /path/to/repository
```
