---
name: plan-bounded-fix
description: Produce one structured, fifteen-minute implementation plan from a vetted issue and compact repository bundle. Use for the Qwen planning phase, exact file selection, commit-step design, verification-command choice, time estimation, or deciding whether one web lookup is indispensable.
---

# Plan Bounded Fix

Plan the smallest complete behavior required by the issue. Use only supplied
repository evidence; missing evidence is uncertainty, not permission to guess.
Candidate paths are ranked by issue-term evidence. Select an existing target
only when its supplied source contains the relevant implementation behavior;
never choose a file merely because its route or page name resembles the report.

Return at most two coherent commit steps and five total target files. Each step
must state one purpose, exact paths, repository-native verification commands,
and one conventional commit message. Include only extra context files that exist
and are essential to editing those targets.

Estimate focused implementation plus local verification honestly. Set
`solvable=false` for unknown scope, more than fifteen minutes, broad refactors,
generated/vendor changes, installation or privileged infrastructure, unclear
behavior, or verification that cannot run locally.

Choose commands already supported by the detected repository. Never propose
unlocked dependency changes, shell composition, destructive flags, deployment,
publishing, or credential access. Include at least one check. When dependencies
are absent, select at most one configured lockfile-based setup command; prefer
script-disabled installation and count its time in the estimate.

Set `needs_search=true` only for one narrow external technical fact that source,
guidance, and manifests cannot answer. Provide a focused query; never request
general research or repository discovery.
