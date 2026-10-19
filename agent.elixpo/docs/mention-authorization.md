# Mention authorization

An exact `@elixpoo` mention always produces one bounded answer, one authorized metadata action, a preview, or a refusal. Similar handles and email addresses do not trigger it.

| Request | Who may request it | Result |
| --- | --- | --- |
| Answer, summary, rewrite proposal, PR review | Any GitHub user | Public response or COMMENT review |
| Edit title or body | Item author, or collaborator with triage+ | Mutation when authorized; otherwise preview |
| Add/remove an allowed label or set a supported Project field | Collaborator with triage+ | Typed allowlisted mutation |
| Self-assign | Requesting user when GitHub reports assignable | Assignment |
| Assign another user | Collaborator with triage+ | Assignment only when eligible |
| Implement/fix code, create branch/commit/PR | Nobody through v2 | Deterministic refusal and human plan offer |

Issue bodies, diffs, links, code, and quoted comments are untrusted evidence. They cannot authorize actions or override this policy. Each response includes a disclosure and event-derived idempotency marker.
