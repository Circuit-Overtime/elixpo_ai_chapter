See [AGENTS.md](AGENTS.md) for the operating manual — architecture, edge-runtime constraints, repo structure, migrations, biome workflow, git conventions, common mistakes, and communication style.

Runbooks the agent should follow:
- `.claude/commands/respond-to-issue.md` — decision tree for issue work (question vs implement vs commit-to-existing-PR).
- `.claude/commands/commit-push-pr.md` — branch state, biome gate, commit, push, PR.
- `.claude/commands/review.md` — review output format.
- `.claude/commands/format.md` — biome.sh runbook.

For third-party OAuth integration (external consumer docs): `docs/README.md`.
