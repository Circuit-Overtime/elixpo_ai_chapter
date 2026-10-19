---
name: release-readiness
description: Audit a local build for correctness and operational release blockers without publishing it.
---

1. Confirm the intended release scope and supported platforms.
2. Run repository-required formatting, lint, tests, and build checks.
3. Inspect versioning, migrations, compatibility, license, dependency, and rollback risks.
4. Verify credentials and local artifacts are excluded from the release.
5. Produce a pass/block verdict with evidence; never publish or enable distribution unless explicitly authorized.
