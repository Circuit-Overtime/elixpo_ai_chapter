# Security policy

## Private reporting

Please use [GitHub private vulnerability reporting](https://github.com/elixpo/crumb.elixpo/security/advisories/new)
for vulnerabilities. If that route is unavailable, email `hello@elixpo.com`
with the repository name, affected version or commit, impact, reproduction
steps, and any suggested mitigation.

Do not disclose an unresolved vulnerability in a public issue or discussion.
We will acknowledge a usable report, investigate it, coordinate a fix, and
publish an advisory when disclosure is appropriate. No response-time guarantee
is made while Crumb is pre-release.

## High-priority boundaries

Reports are especially useful when they concern:

- tool permission or workspace-boundary escapes;
- command execution that bypasses explicit authorization;
- prompt injection that reaches privileged tools or secrets;
- connector, token, credential, or agent-trace exposure;
- unsafe path handling, symlink traversal, or destructive operations;
- dependency, release, workflow, or artifact supply-chain compromise; or
- cross-user data exposure in the hosted documentation or connector surface.

Prompt behavior without a demonstrated security boundary failure may be handled
as a normal bug. Never include real secrets or third-party personal data in a
reproduction.
