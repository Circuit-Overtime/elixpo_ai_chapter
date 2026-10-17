# Elixpo Repository Standard 0.1

**Status:** Pilot specification  
**Effective date:** 2026-10-16  
**Normative schema:** [`project-manifest.schema.json`](../../content/schemas/project-manifest.schema.json)  
**First pilot:** [`elixpo/blogs.elixpo`](https://github.com/elixpo/blogs.elixpo)

Version 0.1 records the contract discovered through the LixBlogs pilot. It is
not an organization-wide 1.0 mandate. A repository adopts this version only
after its maintainer reviews the migration through a pull request.

## Purpose

The standard makes an Elixpo repository understandable and operable without
making every project identical. A contributor should be able to determine:

- what the project is and why it exists;
- whether it is active, paused, maintained, completed, or archived;
- who can make project and operational decisions;
- how to run its actual checks;
- how to report security and support issues;
- which license and notices apply; and
- which operations remain specific to that repository.

The standard does not transfer project authority, silently relicense existing
work, or grant central automation access to production systems.

## Conformance language

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe requirements
for repositories that declare conformance to this version.

A repository is one of:

- **conformant** — all applicable requirements pass;
- **conformant with recorded exceptions** — every deviation has an owner,
  reason, review date, and remediation or permanence decision;
- **migration in progress** — a reviewed migration exists but is incomplete;
- **not assessed** — no conformance claim is made.

## Canonical ownership

The central registry in `elixpo/elixpo/content/` owns public classification,
editorial descriptions, and organization-wide facts. The repository manifest
owns local technical and operational facts.

When the sources disagree, public presentation MUST stop or mark the record as
unverified. It MUST NOT silently choose the more favourable value.

The manifest `project.name` MUST match a record in `content/repositories.json`.
The manifest `project.id` is the stable public slug and does not need to equal
the GitHub repository name.

## Required repository files

Every active, incubating, maintenance, paused, or completed repository MUST
contain:

| File | Responsibility |
| --- | --- |
| `.elixpo/project.yml` | Machine-readable identity, lifecycle, ownership, CI, and policy pointers. |
| `README.md` | Project purpose, use, operation, status, and Elixpo relationship. |
| `CONTRIBUTING.md` | Review path, development checks, contribution terms, and sign-off rules. |
| `CODE_OF_CONDUCT.md` | Participation and enforcement expectations. |
| `SECURITY.md` | Private reporting route and supported scope. |
| `SUPPORT.md` | Public support routes, boundaries, and service-level expectations. |
| `LICENSE` | Current legal terms; planned policy is never presented as current. |

The following files are conditional:

- `GOVERNANCE.md` MUST exist for Member Projects, transferred projects,
  multiple-maintainer projects, or repositories with privileged operations.
- `NOTICE` or a documented notice location MUST exist when third-party assets,
  trademarks, reserved distribution identities, datasets, models, or mixed
  licenses require it.
- `CHANGELOG.md` MAY be replaced by generated GitHub Releases only when the
  README links to that release history and the release process is documented.
- `AGENTS.md` SHOULD exist when automated contributors require project-specific
  constraints that do not belong in contributor-facing documentation.

Archived repositories use a smaller archival profile to be defined separately.
They MUST NOT be rewritten to appear actively supported.

## Manifest contract

The manifest MUST validate against the schema for the declared
`schema_version`. Version 0.1 uses snake-case field names and requires:

- identity: stable ID, repository name, title, factual description, public
  family, primary artifact type, lifecycle, relationship, and custody;
- provenance: repository URL, status owner, and verification date;
- publication: public visibility, feature eligibility, and canonical slug;
- licensing: current license location and migration state;
- quality: exact lint, test, and build commands, including empty strings where a
  check does not apply;
- maintainers: at least one accountable GitHub identity;
- policy pointers: governance, support, and security documents.

`featured: true` means eligible for editorial consideration. It does not
guarantee placement on the landing page.

Secrets, tokens, personal data, environment values, private infrastructure
addresses, and unverified impact claims MUST NOT appear in the manifest.

## README contract

Project READMEs SHOULD follow this order, omitting only genuinely inapplicable
sections:

1. Project identity, lifecycle, and one-sentence purpose
2. Why the project exists
3. Demo, deployment, package, paper, or primary artifact
4. Capabilities and non-goals
5. Architecture
6. Installation and local development
7. Configuration and environment contract
8. Testing and quality checks
9. Releases and packages
10. Contribution pathways
11. Security and support
12. Maintainers and governance
13. License, notices, and attribution
14. Short relationship to Elixpo

The README MUST remain project-focused. It MUST NOT copy the full Elixpo
project directory, dynamic contributor counts, programme claims, or lifecycle
facts owned by the central registry.

## Pull-request quality baseline

Every non-archived software repository MUST expose small, deterministic checks
that can be required independently. At minimum:

- formatting or linting, when a command exists;
- tests, when a test suite exists;
- the production-compatible build, when the project is built;
- registry or documentation conformance, once the shared checker exists.

A single job SHOULD NOT combine unrelated checks when doing so prevents fast
feedback or selective reruns. Required check names MUST be stable and recorded
before branch protection depends on them.

Pull-request checks MUST:

- declare least-privilege permissions;
- run without repository secrets for fork pull requests;
- pin the runtime version used by the project;
- use lockfile-respecting dependency installation;
- set timeouts and cancel superseded runs; and
- document the equivalent local command.

## Privileged workflow boundary

Deployment, package publication, remote migrations, payments, moderation,
production data access, signing, and marketplace publication remain
repository-specific. They MUST NOT be placed in a generic organization
workflow merely for consistency.

Privileged workflows MUST identify their trusted event, environment, required
approvals, permissions, credential owners, and recovery path. Fork-controlled
code MUST NOT receive secrets. A reusable workflow MUST expose only the minimum
inputs and permissions required for its single responsibility.

AI and agent automation is optional. A repository MUST remain buildable,
reviewable, and governable when agent workflows are disabled.

Cloudflare Pages repositories SHOULD follow the common
[deployment workflow standard](deployment-workflow-standard.md). That standard
shares review stages, safety boundaries, and stable labels while preserving
repository-owned preparation, signing, smoke tests, and recovery logic.

## Branch protection baseline

The recommended active-repository baseline is:

- changes enter the default branch through pull requests;
- at least one approval is required;
- stale approvals are dismissed after new commits;
- review conversations must be resolved;
- deterministic test and build checks are required and current with the base;
- force pushes and branch deletion are blocked; and
- bypass authority is absent or assigned to a documented emergency role.

Repositories MAY require stronger protections. A weaker rule is an exception
that needs an owner and reason.

## Migration procedure

1. Verify the registry classification with the project maintainer.
2. Audit existing documentation, licenses, workflows, releases, permissions,
   deployments, and secret boundaries without changing them.
3. Add the manifest with `conformance.status: migration-in-progress`.
4. Apply the documentation baseline while preserving valid technical content.
5. Separate deterministic pull-request checks from privileged operations.
6. Record exceptions in the manifest and pull-request description.
7. Run ordinary-branch, same-repository PR, fork PR, release, and failure-path
   verification appropriate to the repository.
8. Obtain maintainer approval and only then declare conformance.

Migration MUST use a reviewable branch and pull request. Bulk automation MUST
generate diffs; it MUST NOT push silent rewrites to project repositories.

## Conformance checker

Run the human-readable audit from a checkout of `elixpo/elixpo`:

```bash
npm run repository:check -- /path/to/project
```

The checker validates the 0.1 manifest contract, required and conditional
documents, policy and workflow pointers, maintainer accountability,
conformance metadata, and agreement with the canonical repository and
directory records. It reports a remediation beside every finding and does not
modify the target repository. Use `--strict` when warnings should fail CI.

The checker requires Python 3 and PyYAML in the audit environment. This is a
tooling dependency of the central audit, not a dependency imposed on project
applications.

## Known 0.1 gaps

- Archived, research, hardware, and package-focused profiles need pilot repos.
- Workflow reuse boundaries require inventory across `elixpo`,
  `elixpo_chapter`, and `agent.elixpo`.
- The organization licensing and trademark separation is approved in direction
  but existing repositories still require rights audits.
- Maintainer verification, succession, and exception-expiry procedures need a
  final governance policy.

These gaps prevent promotion to version 1.0.
