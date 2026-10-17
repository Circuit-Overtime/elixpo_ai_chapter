# Elixpo registry relationships

**Status:** Public operating policy  
**Last verified:** 2026-10-17  
**Canonical records:** [`content/repositories.json`](../../content/repositories.json)

The public registry describes four different facts separately: a repository's
relationship to Elixpo, its current lifecycle, who has custody of the GitHub
repository, and the licence evidence published by the owning repository.
None of those fields silently substitutes for another.

## Relationship classes

| Relationship | Meaning | Does not imply |
| --- | --- | --- |
| Core / Elixpo-originated | The work was created or is operated as part of Elixpo. | One universal licence, guaranteed service availability, or ownership of every contribution. |
| Chapter participant | The project is participating in a bounded, public Elixpo Chapter with a stated outcome and contribution record. | Transfer of its repository, copyright, trademark, domains, or maintainer authority. |
| Member-maintained | The original maintainer builds with the Elixpo community under a documented operating relationship. | That Elixpo authored the work or may silently relicense it. |
| Connected work | A documented technical, publication, or ecosystem connection exists. | Elixpo ownership, endorsement, maintenance, or support. |

## Evidence states

- **Verified** means the named status owner checked the record against current
  primary evidence and the record includes a verification date.
- **Decision recorded** means an accountable classification decision exists,
  but the full maintainer and primary-evidence confirmation is not complete.
- **Needs decision** means the record publishes its unresolved questions rather
  than guessing.

A verification date is not a perpetual guarantee. Registry validation treats
old evidence as stale and requires it to be checked again.

## Lifecycle and custody

Lifecycle answers whether work is incubating, active, in maintenance, paused,
completed, or archived. Custody answers where repository administration sits.
A transferred repository can remain author-led; a Core project can be paused;
an archived repository can remain public as historical evidence.

## Licensing boundary

Relationship and custody do not grant reuse rights. The licence or notice in
the owning repository or artifact record controls. Missing or unclear licence
evidence is published as missing or unclear, and no permission is inferred.

## Corrections

Maintainers and contributors can request a correction through the relevant
project discussion or the organization forum. Changes to relationship,
lifecycle, custody, contributor credit, or licensing require human review and
must update the canonical registry before downstream sites synchronize.
