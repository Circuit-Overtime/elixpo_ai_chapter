# Repository workflow responsibilities

**Standard:** Elixpo Repository Standard 1.0  
**Scope:** Ordinary non-agent workflows  
**Last reviewed:** 2026-10-17

The organization shares workflow responsibilities, not one privileged YAML
file. Each repository implements only the responsibilities its artifact and
release model require. Deployment, payments, moderation, signing, databases,
package publication, marketplaces, and production data remain repository-owned.

| Responsibility | Required behavior | Enablement |
| --- | --- | --- |
| Pull-request quality | Run the repository's declared formatting, lint, type, test, and build checks without secrets. | Required when a corresponding local command exists. |
| Dependency and security | Review dependency changes, run ecosystem security checks, and keep vulnerability reporting private. | Required for repositories with dependencies or released executables. |
| Issue and pull-request triage | Label and route public work with `contents: read` and the narrowest issue/PR permission. | Optional; must remain useful without an agent. |
| Contribution-policy validation | Protect required policy files, manifest identity, and generated registry/README state. | Required for Standard 1.0 repositories where automation exists. |
| Release and changelog support | Build from reviewed source, preserve release notes, and keep publication separate from ordinary pull requests. | Required for repositories that publish versions or artifacts. |
| Registry and README drift | Synchronize canonical snapshots before checking them and reject generated-output drift. | Required for the portal and specialized publication surfaces. |
| Artifact or package publication | Publish only on an explicit trusted event, with repository-owned credentials and post-publication verification. | Opt-in only. Never part of the generic baseline. |

## Security contract

Every ordinary workflow must declare least-privilege top-level permissions,
pin third-party actions to full commit SHAs, bound every job with a timeout, and
use concurrency cancellation where abandoning an older run is safe. Fork pull
requests remain secretless and read-only. A workflow that references secrets on
`pull_request` must prove that the secret-consuming job rejects fork-controlled
code before checkout or execution.

The portfolio audit in `scripts/audit-workflows.py` enforces these mechanical
boundaries. Its accepted 2026-10-17 assessment covers 91 ordinary workflows
across 23 repositories with zero errors and zero warnings. Agent workflows and
the Agent, Crumb, and OreoPI repositories are explicitly excluded pending the
separate agent-direction decision; they are not silently treated as conformant.

## Migration and rollback

Each workflow migration uses a dedicated branch and reviewed pull request. The
previous default-branch workflow is the rollback source. A maintainer records
the pre-migration commit, required check names, privileged environment owner,
and the command or GitHub operation that restores the earlier file. Rollback
never means exposing a secret, bypassing artifact verification, or rewriting
published history.

After merge, maintainers verify an ordinary branch or pull request and every
trusted event the repository actually uses. Intentional failures should be
limited to secretless validation jobs; production credentials, payments,
databases, signing keys, and package registries are not used for destructive
failure demonstrations.

The baseline is reviewed every January and whenever a privileged workflow,
required check, deployment destination, package registry, or repository custody
changes. Repositories upgrade deliberately through reviewable pull requests;
unrelated projects are not rewritten merely because the standard was revised.
