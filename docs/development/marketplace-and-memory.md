# Marketplace and memory boundaries

Crumb's marketplace is an offline-first package catalog. The binary ships a public catalog,
and the website publishes the same metadata and artifacts at `/marketplace/catalog.json`.
Adding a marketplace never happens during terminal startup.

## Package lifecycle

1. A namespaced package (`publisher/name`) declares a version, license, source, capabilities,
   artifacts, and one or more skill or MCP entries.
2. Crumb rejects unknown fields, unsafe paths, duplicate identifiers, oversized files, and
   malformed environment-variable references.
3. Installation copies only declared regular files into an immutable project or user cache,
   verifies every SHA-256 digest, and atomically publishes the version.
4. Installation registers components disabled. It does not run hooks, start MCP processes,
   resolve secret values, or grant permissions.
5. A later explicit user action may load a skill or enable an installed MCP entry. Crumb's supervised
   MCP boundary owns discovery, approval, cancellation, output filtering, health, and per-call audit
   events. Marketplace MCPs are never passed directly into a provider CLI, so they cannot bypass
   Crumb's permission broker.

The schema lives at `marketplace/schema/catalog.schema.json`. The initial public catalog contains
two inspectable skills and one descriptor for Crumb's built-in policy-controlled workspace MCP.

The user-facing skill protocol is available both as `crumb skill ...` and the
interactive `/skill ...` namespace. Search is metadata-only; inspect performs
no mutation; install leaves every component disabled; and enable/disable stays
separate from package installation and removal. `run <publisher/name>[@version]
-- <task>` verifies the active installed release and executes only its already
enabled instruction skill. Running never installs, enables, or expands tool
permissions. The plural `/skills` namespace
remains as a compatibility surface for local registrations.

Explicit remote search downloads only the bounded, Sigstore-authenticated
`/marketplace/discovery.json` index. An offline search may use a cached index only after rechecking
its cached signature bundle, then the bundled index; it never downloads skill instructions. A
reachable index with invalid authentication fails visibly instead of silently downgrading. Explicit inspection resolves
one immutable `publisher/name@version` reference and downloads only
`/marketplace/manifests/<publisher>/<name>/<version>.json`. The full manifest must match the byte
length and SHA-256 digest pinned by the discovery index before it is displayed or cached. HTTP
redirects remain disabled, every response keeps its type, time, and byte limits, and no marketplace
network request runs during terminal startup. Remote installation retains the existing verified
catalog and publisher-artifact Sigstore chain while its multi-package atomic installer is completed.

## Memory lifecycle

Durable memory has two scopes:

- project: `<workspace>/.crumb/MEMORY.md`
- user: `~/.crumb/memory/MEMORY.md`

Only `/memory remember <project|user> <text>` writes an entry. Models have no durable-memory write
tool. Entries are single-line, bounded, atomically saved, and rejected when they resemble common
credentials. Agent turns receive a bounded read-only projection labeled as user-approved context,
never as permission. `/memory show`, `/memory forget`, `/memory compact`, and `/memory status` keep
the state inspectable and reversible.

Session state stays in the existing session journal and bounded recent-command context. It is not
silently promoted into durable memory. This prevents transient tool output, provider payloads, and
secrets from becoming long-lived preferences.

## Optimizer coverage

Normal shell output is printed unchanged. When recent command output is later attached to an agent
request, Crumb first redacts and bounds it, then lazily invokes configured optimizers such as RTK.
An external result is accepted only when it is smaller and preserves every critical diagnostic.
Optimizer absence, timeout, or failure falls back to the native filtered result.

## Competitive interoperability decisions

The manifest follows the strongest common conventions rather than cloning one product:
namespaced IDs and metadata-only registry entries from MCP Registry, versioned cached packages and
separate install/enable phases from established CLI marketplaces, and portable `SKILL.md` content.
Crumb adds digest verification, explicit capability declarations, no lifecycle scripts in schema
v1, secret references instead of values, and project/user install scopes.

The policy-owning MCP client/proxy, server identity checks, tool-schema snapshots, per-call
approvals, cancellation, health status, and bounded outputs are implemented in the native runtime.
General third-party connector rollout remains a separate release decision; the current production
scope exposes Pollinations only until the selective-prompt smoke-test gate passes.
