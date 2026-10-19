---
name: plan-execute
description: Turn broad implementation requests into small, independently verifiable work packages.
---

1. Identify dependencies, invariants, acceptance criteria, and deferred work.
2. Order packages so each leaves the repository usable and testable.
3. Use `spawn_agents` only for two to four independent read-only investigations whose parallel results materially reduce latency; keep sequential or tiny work in the parent.
4. Keep unrelated cleanup outside the active package.
5. Validate proportionally after each package and record unresolved risks.
6. Continue autonomously while safe in-scope work remains; stop only for a real decision or missing authority.
