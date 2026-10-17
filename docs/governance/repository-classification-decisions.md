# Repository classification decisions

**Decision owner:** Elixpo maintainers  
**Current verification:** 2026-10-17  
**Canonical inventory:** [`content/repositories.json`](../../content/repositories.json)

This record documents how Elixpo verifies the public classification of every
repository. It is an operational decision record, not a claim that repository
activity alone proves maintenance, quality, ownership, or future support.

## Verification basis

Each `verified` inventory record has passed all applicable checks below:

1. The repository name, owner, visibility, default branch, and GitHub archive
   flag were checked against the GitHub API.
2. Lifecycle, public family, and Elixpo relationship were confirmed by the
   accountable Elixpo maintainer. These are governance decisions and are not
   inferred from commit frequency.
3. Custody distinguishes Elixpo-owned, transferred, externally owned, and
   mirrored work. Repository presence never silently transfers copyright or
   maintainer authority.
4. Public entries resolve to current repository-license evidence in
   [`content/repository-licenses.json`](../../content/repository-licenses.json).
   A missing or custom license remains explicitly labelled; verification does
   not manufacture reuse permission.
5. Research maturity and review status remain independent from repository
   lifecycle. A verified project record does not imply peer review.

## Current decision boundaries

- `agent.elixpo`, `crumb.elixpo`, and `oreoPI` remain paused projects. Their
  verified registry status does not approve or begin repository consolidation.
- `Kareixo` remains a transferred Member Project whose original maintainer
  retains project and administrative authority.
- `search.elixpo` remains externally owned by Pollinations and connected to
  Elixpo; it is not represented as Elixpo-owned custody.
- Archived repositories remain historical records and are not presented as
  supported releases.
- Supporting repositories and deleted tombstones do not become public catalog
  projects solely because their inventory records are verified.

## Reverification

Changes to repository ownership, archive state, lifecycle, relationship,
license evidence, deployment, or research status require a new verification
date and a reviewed update to the canonical inventory. Automated checks may
detect drift, but they do not make governance decisions.
