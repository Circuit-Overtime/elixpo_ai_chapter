# Elixpo deployment workflow standard

**Status:** Accepted contract  
**Reference implementations:** `research.elixpo`, `packages.elixpo`  
**Last reviewed:** 2026-10-17

Elixpo repositories use a common deployment shape so maintainers can recognize,
review, and recover a release without pretending that every project has the
same infrastructure. The shape is shared; privileged preparation and release
logic remains owned by the repository that operates it.

## Required workflow shape

A deployment workflow MUST use the visible name `Deploy Cloudflare Pages` when
Cloudflare Pages is its destination and MUST contain these stages in order:

1. check out the trusted revision;
2. install the pinned project runtime and lockfile dependencies;
3. synchronize the repository's canonical registry snapshot, then verify that
   the generated snapshot has no remaining drift;
4. build the static publication artifact;
5. perform repository-specific preparation, signing, or packaging;
6. verify that the named Cloudflare Pages project exists;
7. deploy to the stable `*.pages.dev` candidate hostname;
8. smoke-test representative pages, crawl files, and downloadable artifacts;
9. attach or verify the production domain only after every candidate check
   passes.

Every workflow MUST declare least-privilege permissions, an explicit runner,
timeout, environment, and repository-specific concurrency group. A failed
build, crawl check, signature check, or candidate smoke test MUST stop domain
promotion.

The candidate hostname is the recovery boundary. Maintainers can inspect it
without changing the public domain. The previous successful public deployment
remains available when a candidate fails.

## Trusted events and credentials

Production credentials MUST NOT run for pull requests or fork-controlled code.
Automatic deployments MAY run after a push to the protected default branch.
Domain promotion SHOULD remain an explicit `workflow_dispatch` boolean until a
repository has demonstrated a reliable rollback path.

The baseline Cloudflare workflow requires:

- `CLOUDFLARE_API_TOKEN`, limited to the Pages project operations required by
  the repository;
- `CLOUDFLARE_ACCOUNT_ID`; and
- the workflow-provided `GITHUB_TOKEN` with only `contents: read` and
  `deployments: write`.

Additional credentials, including signing keys, package registries, databases,
payments, moderation, and marketplace tokens, remain repository-specific. They
MUST be documented in that repository's operational policy and MUST NOT be
added to the organization starter merely to make YAML files identical.

## Stable labels

The shared labels make Actions runs readable across the organization:

| Element | Required label |
| --- | --- |
| Workflow | `Deploy Cloudflare Pages` |
| Deployment job | `Validate and deploy` |
| Project guard | `Ensure Cloudflare Pages project exists` |
| Candidate release | `Deploy candidate to Cloudflare Pages` |
| Candidate verification | `Smoke-test candidate …` |
| Optional promotion | `Attach production custom domain` |
| Public verification | `Verify production hostname after promotion` |

The ellipsis is replaced by the artifact being checked, such as `publication`
or `catalogue and signed repository`.

## Repository-specific contract

Each adopting repository MUST record alongside its workflow:

- output directory;
- Pages project name and candidate hostname;
- production hostname;
- build and pre-deploy validation commands;
- representative smoke-test routes and artifacts;
- any signing or publication credentials;
- rollback owner and recovery procedure; and
- the checks required before promotion.

`packages.elixpo` therefore retains its release download, Debian metadata,
signature, and remote package-index verification. `research.elixpo` retains its
research-registry validation and publication-route checks. These differences
are required operational controls, not drift.

## Organization starter

The organization repository publishes a `Static Node site on Cloudflare Pages`
starter under `.github/workflow-templates/`. It supplies the common structure,
but an adopting maintainer MUST replace the project, output, hostname, and
smoke-test values and review the generated pull request before merging it.

Check one or more local migrations from the portal repository with:

```bash
npm run workflow:deploy:check -- ../research.elixpo ../packages.elixpo
```

The checker enforces the stable stages, privilege boundary, timeout and
concurrency declarations, and commit-SHA action pins without evaluating the
repository-specific build or release logic.

Do not copy this workflow into repositories that deploy Workers, databases,
containers, signed packages, or services without first defining their own
candidate and recovery boundary.

## Acceptance evidence

Both reference repositories have demonstrated:

- deterministic local validation;
- a successful candidate deployment;
- successful remote smoke tests;
- an intentional production-domain promotion; and
- a documented recovery path after a deliberately failed candidate.

Research and Packages now operate the accepted contract. The portal follows the
same candidate, production-stamp, and remote-verification boundary while
retaining its own registry and README checks. New adopters still require a
repository-specific recovery review before promotion.
