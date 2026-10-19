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

- `agent.elixpo` is active as the specialized Elixpoo v2 project-management
  runtime. It is not a coding agent: source edits, solution branches, code
  commits, and code-solving pull requests remain outside its authority. Its
  reusable privileged workflows are assessed through their dedicated rollout
  and authorization contract rather than the ordinary workflow baseline.
- `crumb.elixpo` is active as Crumb, Elixpo's pre-release self-hosted autonomous
  Rust agent harness and natural language terminal. Its execution and control
  plane are locally operated; Pollinations is the default connected inference
  provider. Crumb remains separate from Elixpoo and may implement workspace
  tasks only through its own user-granted permission boundary.
- `oreoPI` remains paused. Neither active agent product implies its
  consolidation, reactivation, or transfer.
- `Kareixo` remains a transferred Member Project whose original maintainer
  retains project and administrative authority.
- `cypher` is an incubating core application. The rename from `Cypher-3.0`
  preserves repository history; it does not imply that the prototype is a
  production-ready security service.
- `wozformer` is an active research project. Its implementation and paper draft
  are public, but no WozFormer paper is currently represented as released or
  peer reviewed.
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
