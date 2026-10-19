# Elixpo agent ecosystem framework roadmap

> Released baseline: OreoFlow `v1.3.0` provides the public `oreoflow/`
> contracts for agent cards, capabilities, rooms, tasks, integrity-checked
> messages, artifacts, policy grants, deterministic routing, adapter protocols,
> JSON Schemas, and the model Router. This document still tracks hosted
> scheduling, durable room leases, carrier delivery, security residents, and
> official external protocol conformance.

This is the dependency-ordered plan for evolving `agent.elixpo` from a set of
independent squads into a vertically scalable multi-agent ecosystem.

The product metaphor is a building:

- **Building** — one deployed Elixpo control plane.
- **Floor** — one durable agent system or operational domain.
- **Room** — one isolated, concurrent unit of work.
- **Resident agent** — a capability available inside a room.
- **Floor service** — Doctor, Janitor, Security, and Carrier services shared by
  rooms without sharing their private working context.
- **Carrier** — a constrained courier that transfers typed tasks, status, and
  artifact references between rooms or floors.

The metaphor must map directly to runtime contracts. It must never become a UI-only
abstraction that hides global mutable state or implicit agent conversations.

## Architecture decisions

- [x] Keep GitHub issues, Project V2, committed `state/`, and bounded Gist files as
      the durable system of record. Do not add an external database.
- [x] Keep squads independently executable. A squad may depend on `lib`, `rtk`, and
      framework contracts, but never import another squad's implementation.
- [x] Treat every room as an isolated run with its own identity, budget, workspace,
      messages, artifacts, Doctor supervision, and cleanup manifest.
- [x] Allow multiple rooms on one floor so different repositories or topics can run
      concurrently without overwriting shared `state/*.json` files.
- [x] Use the Linux Foundation Agent2Agent protocol's Agent Card, Task, Message,
      Part, Artifact, lifecycle, streaming, and push-notification concepts for the
      agent-to-agent boundary. Do not create a competing general protocol.
- [x] Define an **OreoFlow A2A profile** for GitHub transport, room identity,
      capability scopes, budgets, idempotency, and public-action policy.
- [x] Continue using MCP-style interfaces for agent-to-tool capabilities. A2A is
      agent-to-agent; MCP is agent-to-tool/context. They are complementary.
- [x] Make Carrier routing deterministic. A Carrier does not call a model merely to
      forward, retry, authorize, or correlate a message.
- [x] Transfer artifact references and bounded summaries across floors, not raw
      prompts, complete transcripts, credentials, or repository workspaces.
- [x] Keep the frontend a projection of framework state. It cannot be the source of
      truth for room status or agent decisions.

Standards references:

- [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)
- [A2A enterprise security guidance](https://github.com/a2aproject/A2A/blob/main/docs/topics/enterprise-ready.md)
- [MCP architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture)

## Target building layout

### Ground floor — standard `@elixpoo` operations

Purpose: provide the building-wide overview and run approved, bounded mention work.

- [ ] Show all current and completed tag-driven issue replies, PR reviews, status
      questions, acknowledgements, rejections, and approval requests.
- [ ] Create one room per authorized mention operation, keyed by the source comment
      or review ID so redelivery cannot create duplicate work.
- [ ] Keep authorization, watchlist, rate-limit, and rejection paths visible.
- [ ] Use a resident Router to classify question, review, implementation, status,
      decline, and escalation intents without performing the work itself.
- [ ] Route implementation or complex review tasks through a Carrier to a new room
      on the OreoFlow floor.
- [ ] Receive a typed completion artifact from OreoFlow before composing the final
      answer on the originating issue or pull request.
- [ ] Keep simple deterministic status responses on the ground floor when no
      OreoFlow room is needed.
- [ ] Provide ground-floor Doctor, Janitor, and Security services.

### First floor — OreoFlow

Purpose: run the full autonomous issue-to-contribution system.

- [ ] Support multiple concurrent rooms, initially bounded to two active rooms and
      configurable later from one central concurrency policy.
- [ ] Key a room by `owner/repo#issue + run_id`; never key shared state only by squad.
- [ ] Give every room the complete ordered capability set:
  - [ ] Scout and Triage for autonomous discovery rooms.
  - [ ] Pick and Vet for selection and suitability.
  - [ ] Solve for repository comprehension, implementation, and verification.
  - [ ] Web Search for external research requested by Solve.
  - [ ] Submit for publication after deterministic and safety gates.
  - [ ] Steward for PR follow-through and maintainer feedback.
  - [ ] Project for operational status synchronization.
  - [ ] Security for input, capability, artifact, and public-action policy.
  - [ ] Doctor for live supervision and terminal recovery decisions.
  - [ ] Janitor for exact room resource cleanup.
  - [ ] Carrier for cross-room and cross-floor handoffs.
- [ ] Isolate fork workspace, CCR process, context bundle, temporary dependency
      state, token budget, and cleanup authorization per room.
- [ ] Permit two rooms to target two repositories simultaneously.
- [ ] Keep the existing global safety limits: daily contribution cap, repository
      opt-out, one active upstream PR per repository, and public-post safety gates.
- [ ] Allow ground-floor issue and PR operations to borrow OreoFlow by opening a
      first-floor room rather than embedding Solve inside the mention handler.

### Second floor — Discussions

Purpose: operate announcements, Q&A, polls, mood-driven activity, and replies.

- [ ] Create separate rooms for scheduled mood activity, merge announcements,
      direct discussion mentions, Q&A generation, and polls.
- [ ] Let each room use Research/Web Search through a typed request when external
      facts are necessary; never let the Discussion writer browse directly.
- [ ] Keep mood history and cooldown state floor-scoped, not duplicated per room.
- [ ] Route complex technical questions to an OreoFlow research/reasoning room when
      repository evidence or code comprehension is required.
- [ ] Return only a bounded answer artifact to the Discussion room for final voice,
      formatting, labels, emoji policy, and safety review.
- [ ] Provide second-floor Doctor, Janitor, and Security services.
- [ ] Keep every public Discussion write behind `qwen-safety` and idempotency gates.

### Future floors

- [ ] Define a floor template that can add Blogger, Documentation, Release,
      Incident, Community, or other agent systems without changing the core router.
- [ ] Require every new floor to declare its rooms, capabilities, service agents,
      inputs, artifacts, budgets, public actions, and lifecycle.
- [ ] Prevent a new floor from receiving credentials or capabilities that its Agent
      Card does not explicitly declare.
- [ ] Add a building schema version so future floor types can coexist during rolling
      migrations.

## 1. Framework package and boundaries

- [ ] Create a dependency-light `lib/ecosystem/` package. Initial modules:

  ```text
  lib/ecosystem/
    ids.py             # building/floor/room/task/message/artifact identities
    cards.py           # Agent Card and capability declarations
    messages.py        # typed OreoFlow A2A envelope
    tasks.py           # task lifecycle and transition validation
    artifacts.py       # immutable artifact metadata and references
    registry.py        # floor, room type, and agent capability registry
    router.py          # deterministic destination selection
    carrier.py         # delivery, receipt, retry, and dead-letter handling
    policy.py          # capability, delegation, and public-action policy
    store.py            # GitHub/state-backed persistence interface
    telemetry.py       # structured room/agent/resource events
    migrations.py      # schema migration registry
  ```

- [ ] Keep `lib/ecosystem/` free of imports from `agents/`.
- [ ] Define stable Python protocols/interfaces for store and transport adapters.
- [ ] Make the core contracts serializable JSON with generated JSON Schemas.
- [ ] Reject unknown schema major versions and preserve unknown optional fields.
- [ ] Add fixtures for forward-compatible minor-version parsing.
- [ ] Keep model routing in `rtk.Router`; the ecosystem framework never calls a
      provider directly.
- [ ] Keep GitHub transport in adapters so a future runtime can replace Actions
      without changing agent contracts.

## 2. Identity and hierarchy contracts

- [ ] Define immutable identifiers:
  - `building_id`: deployed control plane.
  - `floor_id`: durable system family, such as `mentions`, `oreoflow`, or
    `discussions`.
  - `room_id`: one concurrent work isolation boundary.
  - `run_id`: one attempt inside a room.
  - `task_id`: one A2A-style unit of delegated work.
  - `message_id`: one immutable communication event.
  - `correlation_id`: the complete causal chain across floors.
  - `causation_id`: the exact message that produced this message.
  - `artifact_id`: immutable output identity.
- [ ] Use sortable, collision-resistant IDs; never derive authorization from an ID.
- [ ] Persist the source GitHub delivery/comment/review ID as an idempotency key.
- [ ] Define room ownership and lease expiry so crashed workers can be recovered
      without running two writers for the same room.
- [ ] Add a global lookup from repository/issue/PR/discussion to active room IDs.
- [ ] Ensure one room cannot mutate another room's state or cleanup manifest.

## 3. OreoFlow A2A message profile

- [ ] Define one envelope for every inter-agent or inter-floor exchange:

  ```json
  {
    "schema": "oreoflow.a2a/v1",
    "message_id": "msg_...",
    "correlation_id": "corr_...",
    "causation_id": "msg_...",
    "building_id": "elixpo-prod",
    "source": {"floor": "mentions", "room": "mention_...", "agent": "router"},
    "destination": {"floor": "oreoflow", "room": "room_...", "agent": "vet"},
    "kind": "task.request",
    "task_id": "task_...",
    "capability": "issue.solve",
    "deadline": "RFC3339 timestamp",
    "budget": {"tokens": 240000, "seconds": 900},
    "artifact_refs": [],
    "payload": {},
    "policy": {"public_action": false, "delegation_depth": 1},
    "integrity": {"digest": "sha256:..."}
  }
  ```

- [ ] Support these message kinds:
  - [ ] `task.request`, `task.accepted`, `task.rejected`.
  - [ ] `task.status`, `task.completed`, `task.failed`, `task.canceled`.
  - [ ] `artifact.available`, `artifact.revoked`.
  - [ ] `control.pause`, `control.resume`, `control.terminate`.
  - [ ] `security.challenge`, `security.denied`, `security.approved`.
  - [ ] `carrier.received`, `carrier.delivered`, `carrier.dead_lettered`.
- [ ] Define terminal task states once and prohibit messages that mutate a terminal
      task except append-only audit/receipt events.
- [ ] Require every recipient to write an idempotent receipt before execution.
- [ ] Bound payload size; move large output into artifacts and carry references.
- [ ] Hash artifacts and verify the digest before a receiving agent consumes them.
- [ ] Use A2A Task/Message/Artifact mapping at external HTTP boundaries.
- [ ] Do not claim full A2A compliance until official conformance tests pass.

## 4. Agent Cards and capability registry

- [ ] Give every resident and service agent a versioned Agent Card with:
  - stable name, description, owner floor, and implementation version;
  - accepted task kinds and input/output JSON Schemas;
  - declared capabilities and required scopes;
  - maximum delegation depth and supported artifact types;
  - model role, default budget, timeout, and concurrency weight;
  - public-action declaration;
  - health and availability metadata;
  - transport adapters supported by the current runtime.
- [ ] Store repo-native cards under `config/agents/*.yaml` and generate external JSON
      Agent Cards when an A2A endpoint is introduced.
- [ ] Validate the registry at CI time: duplicate capabilities, missing schemas,
      cyclic hard dependencies, and undeclared public actions must fail.
- [ ] Route by capability and policy, not hardcoded module names.
- [ ] Support card version pinning per room so a running task is not changed by a
      deployment midway through execution.

## 5. Rooms and concurrent execution

- [ ] Define a room manifest containing identity, source, objective, participants,
      capability grants, budget, state, artifacts, workspace resources, and lease.
- [ ] Replace singleton handoff files with room-scoped records, for example:

  ```text
  state/building/floors/oreoflow/rooms/<room_id>/
    room.json
    tasks/<task_id>.json
    messages/<sequence>-<message_id>.json
    artifacts/<artifact_id>.json
    telemetry.jsonl
    receipts.jsonl
  ```

- [ ] Keep a compact building index so workflows do not scan every room directory.
- [ ] Use one concurrency key per room and separate bounded floor/global limits.
- [ ] Begin with:
  - building maximum: 4 active rooms;
  - OreoFlow floor maximum: 2 active rooms;
  - Discussions floor maximum: 1 public-writing room;
  - repository maximum: 1 mutating room;
  - issue/PR/discussion maximum: 1 active room.
- [ ] Make limits configuration, not constants in workflow files.
- [ ] Queue excess work fairly by priority, age, floor weight, and repository.
- [ ] Prevent a high-volume mention source from starving autonomous OreoFlow.
- [ ] Add lease renewal, stale lease recovery, cancellation, and bounded retry.
- [ ] Ensure Janitor cleanup is scoped to one room and cannot remove another room's
      workspace or process.

## 6. Resident communication

- [ ] Make communication explicit task handoffs, not shared mutable prompts.
- [ ] Provide per-room communication views:
  - request and acceptance;
  - status and progress;
  - artifact availability;
  - Doctor warnings and control decisions;
  - Security challenges and approvals;
  - final completion or failure.
- [ ] Require a typed output artifact from each capability before the next agent can
      consume it.
- [ ] Limit peer-to-peer chatter. Agents may communicate only when the destination
      declares the requested capability.
- [ ] Detect ping-pong delegation, circular dependencies, repeated questions, and
      non-progress message growth.
- [ ] Give Doctor visibility into room communication counts and token deltas.
- [ ] Record summaries for the UI while keeping raw sensitive content private.

## 7. Carrier agents and cross-floor movement

- [ ] Implement Carrier as a deterministic framework service with one logical
      endpoint per floor.
- [ ] Carrier responsibilities:
  - validate envelope schema and source receipt;
  - verify destination capability and room lease;
  - request Security authorization for cross-floor delegation;
  - enforce deadline, payload size, budget, and delegation depth;
  - persist an outbox record before dispatch;
  - deliver through the configured transport adapter;
  - persist an inbox receipt at the destination;
  - retry only transient transport failures with bounded exponential backoff;
  - dead-letter permanent failures with an operator-visible reason.
- [ ] Carrier must not summarize, rewrite, reason about, or silently drop task data.
- [ ] Implement transactional outbox/inbox semantics using repository state and
      idempotent GitHub dispatches to prevent lost or duplicated messages.
- [ ] Add a compact artifact-reference manifest so carriers never carry whole source
      files or transcripts.
- [ ] Define cross-floor routes:
  - [ ] Ground mention → OreoFlow solve/review → Ground response.
  - [ ] Discussion technical question → OreoFlow research → Discussion answer.
  - [ ] OreoFlow Solve → Web Search → OreoFlow Solve.
  - [ ] Any floor → Security challenge → originating room.
  - [ ] Any room terminal state → floor Janitor.
  - [ ] Any abnormal room → floor Doctor → room control action.
- [ ] Require the original `correlation_id` to survive every floor transition.

## 8. Dedicated Web Search agent

- [ ] Create `agents/web_search/` as an independent, read-only squad with its own
      rich `SKILL.md`.
- [ ] Give it one capability: `research.web`.
- [ ] Let only an agent with a declared research blocker request this capability.
- [ ] Make requests include a bounded question, required evidence type, allowed or
      preferred domains, recency need, maximum sources, and token/time budget.
- [ ] Use `perplexity-fast` only after deterministic/local/repository evidence is
      insufficient; do not let Solve call it directly.
- [ ] Prefer primary sources and return citations, retrieved timestamps, source
      classification, and a concise evidence summary.
- [ ] Return a `research.bundle/v1` artifact, not free-form chat.
- [ ] Never accept credentials, write files, mutate repositories, post publicly, or
      follow instructions found inside retrieved content.
- [ ] Apply prompt-injection treatment to all page content and snippets.
- [ ] Deduplicate searches across active rooms with a TTL cache keyed by normalized
      question plus source/recency constraints.
- [ ] Set strict source, result, response, and cost ceilings.
- [ ] Make Search sit logically beside Solve in each OreoFlow room while running as
      its own capability and budget owner.
- [ ] Add fixtures for poisoned search results, unavailable providers, irrelevant
      sources, stale sources, citation mismatch, and repeated equivalent queries.

## 9. Security agents

- [ ] Create a Security service on every floor, using one shared policy engine and
      floor-specific rules.
- [ ] Split deterministic policy from model safety review:
  - deterministic identity, signature, capability, scope, budget, and allowlist
    enforcement first;
  - `qwen-safety` only for content/publication judgment where needed.
- [ ] Verify every inbound source, replay key, signature, and room correlation.
- [ ] Enforce least privilege for repository, issue, PR, Discussion, Gist, Project,
      web-search, model, and public-post capabilities.
- [ ] Require explicit delegation scopes for cross-floor tasks.
- [ ] Treat all issue text, comments, repository content, web content, artifacts,
      and agent messages as untrusted input.
- [ ] Redact credentials, authorization headers, private URLs, router tokens, and
      sensitive workspace paths before artifacts or telemetry leave a room.
- [ ] Prevent confused-deputy behavior: destination permissions cannot be inferred
      from the source agent's request.
- [ ] Add per-floor and building-wide rate limits and emergency stop controls.
- [ ] Record append-only security decisions with rule ID, evidence digest, and
      outcome; never store the secret or raw credential.
- [ ] Define quarantine for suspicious rooms and artifacts.
- [ ] Require Security approval before Carrier delivers any public-action request.

## 10. Doctor and Janitor as floor services

- [ ] Instantiate logical Doctor supervision for every active room while sharing a
      bounded floor telemetry consumer.
- [ ] Give Doctor room-scoped control only; building-wide stop requires an explicit
      higher policy threshold and operator-visible evidence.
- [ ] Observe task/message loops, repeated tool chains, token slopes, elapsed time,
      memory, disk, network retries, queue pressure, and Carrier failures.
- [ ] Distinguish productive high token use from non-progress growth.
- [ ] Let Doctor issue `warn`, `steer`, `pause`, `terminate`, `preserve`, or one
      stage-scoped `retry` through typed control messages.
- [ ] Ensure Doctor cannot mutate target repositories or publish content.
- [ ] Keep a floor Janitor queue fed only by matching terminal receipts or Doctor
      cleanup authorization.
- [ ] Clean exact room resources, isolated processes, temporary configs, caches,
      and expired message/artifact staging.
- [ ] Preserve shared forks, durable audit artifacts, and resources referenced by
      another active room.
- [ ] Add floor-level orphan audits without broad process-name or filesystem globs.

## 11. Storage, transport, and recovery

- [ ] Implement the first transport adapters:
  - in-process queue for local tests;
  - filesystem/state adapter for local multi-process runs;
  - `repository_dispatch` adapter for GitHub Actions;
  - webhook/push adapter for Cloudflare ingress;
  - future HTTP A2A adapter behind authenticated endpoints.
- [ ] Preserve at-least-once transport with exactly-once effects through receipts
      and idempotency keys.
- [ ] Never promise exactly-once delivery from GitHub events.
- [ ] Define maximum event age and reject stale control/publication messages.
- [ ] Add an outbox sweeper for dispatch lost after state commit.
- [ ] Add an inbox deduplicator and bounded receipt compaction.
- [ ] Store large artifacts in approved GitHub-native locations and retain only
      digests/references in messages.
- [ ] Define retention by class: live telemetry, operational receipts, completed
      summaries, rejected tasks, and security audit.
- [ ] Recover the complete building index using only GitHub state plus Gist memory.
- [ ] Test crash points before outbox write, after outbox write, after delivery,
      during destination processing, and before completion receipt.

## 12. Scheduling and vertical scalability

- [ ] Add a building scheduler that evaluates floor and room capacity without
      importing or executing squad logic.
- [ ] Use weighted fair scheduling across floors.
- [ ] Reserve one capacity slot for operator-approved/critical recovery work.
- [ ] Separate read-only rooms from mutating rooms when calculating capacity.
- [ ] Derive capacity from configured CPU, memory, disk, token, provider, and GitHub
      API limits rather than room count alone.
- [ ] Apply backpressure before spawning a workspace or model session.
- [ ] Expose queued, leased, running, paused, terminal, and cleanup-pending rooms.
- [ ] Support future horizontal transport workers without changing room semantics.
- [ ] Add admission checks so a future floor cannot exhaust the entire building.

## 13. Frontend building simulator

- [ ] Refactor frontend fixtures into typed `BuildingSnapshot`, `FloorSnapshot`,
      `RoomSnapshot`, `AgentSnapshot`, `MessageSnapshot`, and `ArtifactSnapshot`.
- [ ] Ground floor:
  - overview standard mention operations;
  - active/completed/rejected/approval-required rooms;
  - visible cross-floor OreoFlow handoffs.
- [ ] First floor:
  - room selector for simultaneous repository/topic runs;
  - full OreoFlow residents inside each room;
  - Web Search placed beside Solve;
  - room-specific Doctor, Janitor, and Security status.
- [ ] Second floor:
  - mood, announcement, Q&A, poll, and reply rooms;
  - cross-floor technical research handoffs.
- [ ] Add an elevator/floor navigator that preserves selected room per floor.
- [ ] Animate typed messages and artifact handoffs, not meaningless particles.
- [ ] Expand a room to show objective, repository/topic, current task, queue, budget,
      workspace, artifacts, messages, warnings, and cleanup state.
- [ ] Expand an agent to show capability, current assignment, dependencies, model
      route, tokens, memory, logs, and last communication.
- [ ] Show Carrier transit, delivery receipts, retries, and dead letters.
- [ ] Show real per-room metrics and label fixture data as simulation until wired.
- [ ] Keep raw prompts, secret-bearing logs, private source, and credentials out of
      every frontend response.
- [ ] Add a future-floor placeholder driven from the registry rather than hardcoded
      Blogger UI.
- [ ] Later gate all routes through accounts.elixpo and require `admin` or
      `super-admin`; authorization must execute server-side before telemetry fetch.

## 14. Migration from singleton squads

- [ ] Inventory every existing singleton `state/*.json` owner and consumer.
- [ ] Introduce the framework contracts behind compatibility adapters first.
- [ ] Migrate in dependency order:
  1. [ ] Doctor, Janitor, and telemetry contracts.
  2. [ ] Security and Carrier services.
  3. [ ] Project and Steward receipts.
  4. [ ] Ground-floor mention rooms.
  5. [ ] OreoFlow Vet → Solve → Submit rooms.
  6. [ ] Autonomous Scout → Triage → Pick admission.
  7. [ ] Discussions floor.
  8. [ ] Gist cache/custodian artifacts.
- [ ] Dual-write old singleton receipts and room-scoped receipts during migration.
- [ ] Compare digests and transitions before switching each consumer.
- [ ] Remove `allow_legacy` and singleton compatibility only after end-to-end replay,
      crash recovery, and concurrent-room tests pass.
- [ ] Update every workflow concurrency key and committed-state path.
- [ ] Preserve existing Project/Gist identities during migration.

## 15. Tests and release gates

- [ ] Contract tests for every message, task, artifact, card, room, floor, and
      building schema.
- [ ] State-machine tests for accepted, rejected, running, auth-required, completed,
      failed, canceled, paused, and cleanup-pending tasks.
- [ ] Two simultaneous OreoFlow rooms targeting different repositories.
- [ ] Two attempted mutating rooms targeting the same repository; exactly one waits.
- [ ] Ground mention → OreoFlow → Ground response round trip.
- [ ] Discussion → OreoFlow research → Discussion response round trip.
- [ ] Solve → Web Search → Solve evidence round trip.
- [ ] Duplicate Carrier delivery and destination idempotency.
- [ ] Carrier crash/recovery and dead-letter behavior.
- [ ] Cross-floor delegation denied by capability, trust, expiry, or budget.
- [ ] Prompt injection across issue, repository, web result, artifact, and agent
      message boundaries.
- [ ] Doctor termination followed by exact Janitor cleanup in one room while another
      room continues unaffected.
- [ ] Building restart from committed state while multiple rooms are active.
- [ ] Provider, GitHub, webhook, disk, memory, and token-pressure failures.
- [ ] A2A mapping and conformance tests before exposing an external A2A endpoint.
- [ ] Frontend tests for floor navigation, room selection, agent expansion, Carrier
      visualization, sanitized telemetry, and responsive layouts.
- [ ] Load test at configured maximum capacity plus queued overflow.
- [ ] Run owned-repository canaries before external autonomous operation.

## 16. Documentation and operator controls

- [ ] Write `docs/ecosystem-architecture.md` from implemented contracts, not plans.
- [ ] Add diagrams for building hierarchy, room lifecycle, Carrier delivery, and
      cross-floor OreoFlow delegation.
- [ ] Document adding a new floor and registering a new agent capability.
- [ ] Document room inspection, pause, cancel, retry, preserve, and cleanup actions.
- [ ] Document dead-letter repair without replaying already completed effects.
- [ ] Document protocol/schema migration and rollback.
- [ ] Add operator controls for floor admission, room limits, emergency stop,
      quarantine, and capability revocation.
- [ ] Add daily building summaries for room throughput, success, cost, security,
      cleanup debt, Carrier health, and per-floor capacity.

## Execution order

1. Contracts: hierarchy, identity, cards, tasks, messages, artifacts, and schemas.
2. Local in-process transport, registry, router, Carrier, and policy engine.
3. Room-scoped storage, leases, outbox/inbox receipts, and recovery tests.
4. Floor Doctor, Janitor, Security, and telemetry services.
5. Dedicated Web Search agent and `research.bundle/v1` artifact.
6. Migrate one owned OreoFlow path into two-room-capable execution.
7. Ground-floor mention rooms and cross-floor OreoFlow delegation.
8. Discussions floor and cross-floor research/answer delegation.
9. GitHub Actions transport and workflow concurrency migration.
10. Building/floor/room frontend wired to sanitized snapshots.
11. accounts.elixpo `admin`/`super-admin` authorization gate.
12. External A2A endpoint only after security and conformance gates pass.

## Definition of the first framework milestone

- [ ] Two local rooms can execute concurrently with isolated state and budgets.
- [ ] Agents discover each other through validated capability cards.
- [ ] A typed task crosses rooms through Carrier and produces one idempotent receipt.
- [ ] Doctor observes both rooms independently.
- [ ] Janitor cleans one terminal room without touching the other.
- [ ] Security rejects an undeclared or expired capability delegation.
- [ ] Web Search returns a bounded cited artifact to Solve without repository access.
- [ ] A building snapshot renders both rooms and their message flow in the frontend.
- [ ] The entire milestone passes without a database or direct squad-to-squad imports.
