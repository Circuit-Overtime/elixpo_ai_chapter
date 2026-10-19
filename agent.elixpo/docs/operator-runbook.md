# Elixpoo v2 operator runbook

## Routine checks

1. Run `python -m agents.rollout_audit` and resolve missing or stale callers by reviewable human PRs.
2. Confirm triage events produce allowed labels and one Project V2 item.
3. Mention `@elixpoo` once and verify one disclosure-bearing response.
4. Synchronize a test PR and verify at most one COMMENT review per head SHA.
5. Merge a test PR and verify one schema-v2 Gist record.

## Incident response

- Disable the affected caller in the participating repository; centralized Python cannot run without a caller event.
- Revoke the narrow token involved, then rotate it only in repositories that use that capability.
- Preserve event IDs, workflow URLs, public markers, Project item IDs, and Gist revisions for diagnosis.
- Never bypass a Gist revision conflict. Re-read, reconcile, and write from a fresh snapshot.
- A coding request reaching any legacy workflow is a release blocker. Disable that workflow and run the v2 workflow tests before restoring service.

## Release

Run focused Python tests and workflow validation, review the rollout manifest, publish an immutable release, then move the protected `v2` ref according to maintainer policy. The rollout audit identifies repositories still pinned to an older or malformed caller.
