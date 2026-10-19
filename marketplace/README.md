# Crumb public marketplace

The catalog contains versioned Crumb packages. A package may expose one or more skills,
MCP server launch descriptors, or both. Catalog metadata never grants permissions and
installation never starts a process.

Schema v2 binds each `publisher/name` namespace to an HTTPS source and workload identity.
Every immutable release declares its source revision, release timestamp, authentication
method, Crumb/platform compatibility, disclosures, connector scopes, and deprecation state.
Catalog revocations block new installs of an exact release.

Every copied artifact is listed with its byte size and SHA-256 digest and must stay inside
its package directory. Remote artifacts and Sigstore bundle metadata require HTTPS. MCP
entries declare either supervised STDIO or Streamable HTTP; environment entries are variable
names only. Secret values do not belong in manifests, logs, or memory.

## Contributing a package

1. Add a self-contained directory under `packages/<name>`.
2. Put each skill in `skills/<skill-id>/SKILL.md` with concise YAML frontmatter.
3. Add a namespaced release with provenance, compatibility, disclosures, and artifact sizes.
4. Declare the minimum capabilities and connector scopes. Do not include credentials or hooks.
5. Run `cargo test -p crumb-marketplace` and the workspace merge gate.

The schema deliberately excludes arbitrary lifecycle scripts and secret values. `/marketplace
sync` can refresh the fixed public HTTPS catalog into a bounded, content-addressed cache. Cached
remote metadata is labeled unverified and remains inspection-only.

`/marketplace install-remote <publisher/name>` uses a separate authenticated path. Crumb verifies
the catalog bundle against the pinned Crumb deployment-workflow identity, then verifies every
artifact bundle against the publisher identity from that signed catalog. Size and SHA-256 checks
run before signature verification, all downloads are bounded, and nothing is published until the
complete set passes. Installed components remain disabled. Updates and rollback remain separate
explicit lifecycle steps.

Validate catalog structure against `schema/catalog.schema.json`. Crumb's Rust validator remains
authoritative and additionally enforces publisher namespaces, unique immutable releases,
revocations, compatibility ranges, transport invariants, and artifact relationships.
