---
name: security-review
description: Review code that handles permissions, credentials, execution, network access, or untrusted input.
---

1. Map assets, actors, trust boundaries, and attacker-controlled values.
2. Verify permissions are user-owned, narrow, revocable, and checked outside the model.
3. Trace secrets to ensure they never enter prompts, logs, memory, or persisted diagnostics.
4. Check path traversal, command execution, redirects, resource ceilings, cancellation, and fail-closed behavior.
5. Rank findings by exploitability and impact; include a concrete remediation and regression test.
