# Elixpo direction rollout summary

**Direction fixed:** 2026-10-15  
**Implementation review:** 2026-10-17  
**Scope:** Human-accountable Elixpo commons with bounded project-management automation

## What Elixpo is now

Elixpo is an open-source project foundry. It works with maintainers and
contributors around active software, open research, and public services so that
useful work becomes understandable, participatory, attributable, and
releasable.

The operating unit is an **Elixpo Chapter**: a time-bounded period of public
work with a specific objective, prepared contribution paths, accountable
review, a closing release or documented outcome, and a durable record of who
moved the work forward.

Elixpo is not a SaaS portfolio, a passive repository directory, a project
graveyard, a certification authority, or a promise of permanent maintenance.
Repository transfer is optional. Projects join to ship a next chapter, not to
give up authorship or disappear inside an organization account.

## The public system now in place

- `elixpo.com` is the canonical organization portal and record source.
- `research.elixpo.com` publishes detailed research records without inventing
  peer review, paper releases, or reproducibility claims.
- `packages.elixpo.com` publishes Linux and npm release information tied back
  to the projects that produce it.
- Project, research, service, package, contributor, history, community,
  partnership, policy, and Chapter routes use verified registry content and
  route-specific metadata.
- Sitemaps, robots policies, feeds, canonical links, structured data, and
  social cards are generated from those records.
- The public crawler and Lighthouse audit cover the three publication surfaces
  and fail on crawl, metadata, accessibility, or performance regressions.

## Repository and governance baseline

Elixpo Repository Standard 1.0 now defines the ordinary non-agent baseline:

- a project-owned manifest with lifecycle, custody, relationship, maintainers,
  publication route, license evidence, and conformance status;
- contribution, conduct, security, support, governance, changelog, and license
  boundaries appropriate to the repository;
- secretless pull-request checks that can be reproduced locally;
- least-privilege workflow permissions, immutable third-party action pins,
  bounded jobs, safe concurrency, and read-only fork behavior;
- repository-owned deployment, signing, payment, moderation, and release
  credentials rather than a universal privileged workflow;
- reviewed migrations with an explicit rollback source.

Archived repositories retain their history and central lifecycle/license
record. They are not reopened merely to make a template count appear complete.
Member Projects retain visible maintainer authority. Externally owned connected
projects are not represented as Elixpo property.

## Publication, credit, and consent

Research maturity is independent of project lifecycle. A repository may be an
active research project while its paper remains unreleased or not peer
reviewed. Artifact-specific licenses are published instead of claiming one
organization-wide grant.

Contributor pages connect people to attributable outcomes and primary
evidence. They are professional public records, not certificates or employment
verification. Current biography and image records use public evidence and
public GitHub imagery only. Private biographies, supplied photographs, and
non-public role details stay unpublished until a recorded opt-in exists.

## Brand and support boundaries

The portal contains the canonical public brand library, colors, typography,
icons, diagrams, and watermarked sticker previews. Restricted production
masters and generators remain in the private `brand-production` repository.
Sticker production files are not offered as unrestricted downloads.

Elixpo does not currently accept general financial sponsorship. Public policy
separates non-monetary event partnerships from funding and prevents support
from purchasing project selection, research conclusions, contributor credit,
or editorial treatment.

## Current project decisions

- `cypher` is the new canonical name for `Cypher-3.0`. It is an incubating core
  application under the MIT License and is not represented as production-ready
  security software.
- `wozformer` is an active open research project under the MIT License. Its
  notebooks, model exports, findings, hardware work, and manuscript draft are
  public; no paper is currently represented as released or peer reviewed.
- `agent.elixpo` now operates Elixpoo v2, the organization-wide GitHub
  project-management agent. It performs allowlisted classification, Project
  updates, exact-mention responses, comment-only pull-request review,
  Discussion support, and bounded merged-change recording. Deterministic
  authorization keeps product-code implementation and governance decisions
  outside the agent's authority.
- `crumb.elixpo` is now active as Crumb, Elixpo's handmade self-hosted
  autonomous Rust agent harness and natural language terminal. Crumb owns its
  local execution loop, permissions, tools, memory, sessions, checkpoints, and
  supervision; Pollinations provides its default model intelligence. It is a
  separate product from Elixpoo, which remains a non-coding GitHub
  project-management agent.
- `oreoPI` remains paused. No repository consolidation or dependency migration
  is implied by either active agent product.

## What remains outside this closure

The remaining agent-stack decision concerns OreoPI alone: its device/runtime
direction, ownership, history, and possible relationship to Crumb remain a
separate future programme. Elixpoo v2 and Crumb now have distinct published
purposes and trust boundaries; neither requires a repository merge.

Normal maintenance continues: registry facts change, releases ship, people may
correct or withdraw profile data, and workflows are reviewed when their trust
boundary changes. Those are operating responsibilities, not missing pieces of
the Elixpo direction.
