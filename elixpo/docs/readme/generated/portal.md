<p align="center">
  <img src="public/brand/marks/elixpo_lock_up_text_mascot.webp" width="420" alt="Elixpo wordmark with the Oreo panda mascot" />
</p>

<h1 align="center">Elixpo Portal</h1>

<p align="center">
  <strong>The canonical public portal and organization-content source.</strong>
</p>

## About this repository

This repository builds [elixpo.com](https://elixpo.com) and owns the canonical
organization registry under [`content/`](content/). Project pages, structured
data, sitemaps, shared README content, and future standalone surfaces should
consume or validate against that registry rather than maintain independent
lists.

<!-- BEGIN ELIXPO SHARED · sha256:a225b2fe25bfe81f02feedb267da4763d48391e8026723aa256f81cb0d04ea82 · generated from elixpo/elixpo -->

## What Elixpo is

**An open-source project foundry where people build in public and release meaningful projects together.**

> **Build in public. Release as a project.**

Elixpo works with active maintainers to build and release open software, reproducible research, and publicly operated services. Time-bounded Chapters give work a clear public story, prepared contribution pathways, accountable review, and a durable release record. Successful projects may continue as Elixpo Member Projects.

Projects come to Elixpo to ship their next chapter—not archive their last one.
Elixpo is not a SaaS portfolio, passive project directory, license authority,
repository graveyard, or promise of permanent maintenance. Its services and
infrastructure support public building and release work.

<p align="center">
  <img src="https://raw.githubusercontent.com/elixpo/elixpo/main/public/brand/diagrams/elixpo-ecosystem.svg" width="100%" alt="Elixpo connects open projects, research, and services through public Chapters that lead to releases and durable contribution records." />
</p>

## Projects, Research, and Services

| Public family | Includes |
| --- | --- |
| **Open Projects** | Installable software, libraries, developer tools, hardware, packages, and creative projects. |
| **Open Research** | Papers, experiments, datasets, models, protocols, and reproducible research artifacts. |
| **Open Services** | Hosted applications and shared infrastructure operated by Elixpo. |

Packages are a distribution surface for Open Projects, not a fourth family.
Lifecycle describes the state of the work; Core, Chapter, Member, and Connected
describe its relationship to Elixpo.

## How an Elixpo Chapter works

A Chapter is a time-bounded public build-and-release cycle. It starts with an
active maintainer, a credible artifact or prototype, and one meaningful next
objective. It ends with a release, prototype, report, package, or an explicit
documented closure.

```mermaid
flowchart LR
  A[Selection] --> B[Readiness]
  B --> C[Public build]
  C --> D[Contribution window]
  D --> E[Release or documented closure]
  E --> F[Durable outcome record]
  F -. optional .-> G[Member Project]
```

Repository transfer is not required. A project may remain with its owner while
participating in a Chapter. Member Project status is an ongoing relationship
earned through successful collaboration; it does not automatically transfer
copyright, trademarks, packages, domains, or project authority.

## Current public work

This directory is generated from the canonical registry. It includes every
non-archived public entry and states lifecycle separately from relationship.
Feature placement is editorial and does not change these records.

### Open Projects

| Repository | Lifecycle | Relationship |
| --- | --- | --- |
| [`cypher`](https://github.com/elixpo/cypher) | Incubating | Core |
| [`agent.elixpo`](https://github.com/elixpo/agent.elixpo) | Active | Core |
| [`crumb.elixpo`](https://github.com/elixpo/crumb.elixpo) | Active | Core |
| [`elixpo_chapter`](https://github.com/elixpo/elixpo_chapter) | Active | Core |
| [`Kareixo`](https://github.com/elixpo/Kareixo) | Active | Member |
| [`oreo`](https://github.com/elixpo/oreo) | Active | Core |
| [`packages.elixpo`](https://github.com/elixpo/packages.elixpo) | Active | Core |
| [`sketch.elixpo`](https://github.com/elixpo/sketch.elixpo) | Active | Core |
| [`Nano28C64`](https://github.com/elixpo/Nano28C64) | Maintenance | Core |
| [`oreoPI`](https://github.com/elixpo/oreoPI) | Paused | Core |

### Open Research

| Repository | Lifecycle | Relationship |
| --- | --- | --- |
| [`monodiffuse`](https://github.com/elixpo/monodiffuse) | Active | Core |
| [`octabit`](https://github.com/elixpo/octabit) | Active | Core |
| [`search.elixpo`](https://github.com/pollinations/search.elixpo) | Active | Connected |
| [`wozformer`](https://github.com/elixpo/wozformer) | Active | Core |
| [`qfabric`](https://github.com/elixpo/qfabric) | Completed | Core |

### Open Services

| Repository | Lifecycle | Relationship |
| --- | --- | --- |
| [`opensource.elixpo`](https://github.com/elixpo/opensource.elixpo) | Incubating | Core |
| [`accounts.elixpo`](https://github.com/elixpo/accounts.elixpo) | Active | Core |
| [`admin.elixpo`](https://github.com/elixpo/admin.elixpo) | Active | Core |
| [`blogs.elixpo`](https://github.com/elixpo/blogs.elixpo) | Active | Core |
| [`lixrl.com`](https://github.com/elixpo/lixrl.com) | Active | Core |
| [`mails.elixpo`](https://github.com/elixpo/mails.elixpo) | Active | Core |
| [`me.elixpo`](https://github.com/elixpo/me.elixpo) | Active | Core |
| [`payouts.elixpo`](https://github.com/elixpo/payouts.elixpo) | Active | Core |
| [`status.elixpo`](https://github.com/elixpo/status.elixpo) | Active | Core |

Registry snapshot: **2026-10-18**. Archived work remains visible in the
[GitHub organization](https://github.com/orgs/elixpo/repositories?q=archived%3Atrue)
as history, not as currently supported work.

## Specialized publication surfaces

The main portal remains the organization directory and canonical source for
classification, lifecycle, relationships, and cross-project links. Two
specialized repositories operate deeper publication surfaces:

- [`packages.elixpo`](https://packages.elixpo.com) owns package building, signed APT
  distribution, release artifacts, installers, and the package catalogue.
- [Elixpo Research](https://research.elixpo.com) is the standalone publication
  surface for papers, citations, datasets, models, demonstrations, and
  reproducibility records. The [portal research directory](https://elixpo.com/research)
  provides the organization-level classification and links each record to its
  canonical publication. Research code and primary evidence stay in their
  owning project repositories.

The specialized sites must consume the shared schema or synchronize changes
through reviewable pull requests. They do not maintain independent
organization directories, silently change lifecycle status, or replace the
owning repository as the source of technical evidence.

## Participate

- **Contribute to a project:** use the owning repository's contribution guide,
  current issues, and maintainer review process.
- **Follow current conversation:** use the moderated
  [Elixpo community index](https://elixpo.com/community) or open the canonical forum on
  GitHub. The website's latest feed is activity-ordered and is not an editorial
  endorsement.
- **Discuss a Chapter:** start with [Elixpo Discussions](https://github.com/orgs/elixpo/discussions) and
  describe the working artifact, accountable maintainer, next release objective,
  and availability to review contributions. A discussion is not automatic
  acceptance or a request to transfer the repository.
- **Follow Chapter operations:** use the
  [Elixpo Chapter repository](https://github.com/elixpo/elixpo_chapter).
- **Explore installable work:** visit [Elixpo Packages](https://packages.elixpo.com).
- **Follow research:** browse the [organization research
  directory](https://elixpo.com/research), then open the canonical paper,
  experiment, model, or proposal record on
  [research.elixpo.com](https://research.elixpo.com).

## Evidence, credit, and history

Credit should point to attributable work—merged changes, reviews, releases,
research, design, documentation, or community operations. Repository history is
the current evidence source. The [People record](https://elixpo.com/people) separates
current organization responsibility from project maintenance, alumni, advisors,
and community contribution. The [contributor records](https://elixpo.com/contributors)
describe attributable public outcomes without presenting a commit total as a
measure of human value. The [organization timeline](https://elixpo.com/history) states date
precision and links the public evidence for every milestone.

<p align="center">
  <img src="https://raw.githubusercontent.com/elixpo/elixpo/main/public/brand/diagrams/elixpo-history-strip.svg" width="100%" alt="Verified Elixpo history: the earliest surviving project record in 2023, organization and Chapter formation in 2024, expanded contribution and research in 2025, and the project-foundry direction in 2026." />
</p>

Unknown role dates and empty role categories remain explicit. Elixpo does not
infer employment, certification, permanent affiliation, review, or consent for
a private biography from a public contribution.

## Funding boundary

Elixpo does not currently solicit, accept, hold, or route organization-level
sponsorship funds. Independently governed projects may publish their own funding
routes under their own authority and accounting; listing through Elixpo does
not make Elixpo the recipient or intermediary. Funding does not purchase Chapter
selection, feature placement, research conclusions, contributor credit,
governance authority, or favourable editorial treatment.

## Licensing and brand use

Licenses vary by project and artifact. The terms in the owning repository or
artifact record control, and existing work is not silently relicensed when it
joins Elixpo. New Elixpo-owned code defaults to MIT, with Apache-2.0 available
where its patent grant is useful; papers and general documentation default to
CC BY 4.0; new hardware source defaults to CERN-OHL-S-2.0. Datasets, models,
weights, and brand assets require artifact-specific review.

Copyright permission does not grant permission to impersonate Elixpo or claim
endorsement. The canonical brand destination is the
[Elixpo asset library](https://elixpo.com/assets). Colour tokens, typography guidance, and
general usage guidance are public. Official sticker artwork is shown only as a
watermarked preview; print-ready files or physical packs are released through
an approved written event partnership. Accurate referential use and protected
uses are defined by the published [trademark and brand-use policy](https://github.com/elixpo/elixpo/blob/main/docs/policies/trademark-and-brand-use.md).

---

[Website](https://elixpo.com) · [GitHub](https://github.com/elixpo) ·
[Discussions](https://github.com/orgs/elixpo/discussions) · [Chapter](https://github.com/elixpo/elixpo_chapter) ·
[Research](https://elixpo.com/research) · [Packages](https://packages.elixpo.com) · [People](https://elixpo.com/people) ·
[History](https://elixpo.com/history)

<!-- END ELIXPO SHARED -->
