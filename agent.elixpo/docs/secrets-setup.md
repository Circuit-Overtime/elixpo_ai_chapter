# Elixpoo v2 secrets

Configure these as organization secrets shared only with participating repositories, or as repository secrets where narrower access is preferred.

| Name | Minimum access | Used by |
| --- | --- | --- |
| `ELIXPO_POLLINATIONS_API_KEY` | Pollinations text API | classification, answers, summaries, reviews, safety |
| `ELIXPOO_GITHUB_AGENTIC_TOKEN` | metadata read; contents read; issues write; pull requests write | triage, mentions, reviews, merge metadata reads |
| `ELIXPOO_GITHUB_PROJECT_TOKEN` | metadata read; Projects read/write; access to participating repos | Project V2 item/field updates |
| `ELIXPOO_GIST_AGENTIC_TOKEN` | Gists read/write | revision-checked merge memory and Discussion cursors |
| `ELIXPOO_FOLLOWUP_GIST_ID` | Identifier, not a credential | approved Gist selection |
| `ELIXPOO_GITHUB_DISCUSSIONS_TOKEN` | metadata read; Discussions read/write on `elixpo/elixpo` | canonical Discussions workflow |

Set `ELIXPO_GITHUB_PROJECT_OWNER` and `ELIXPO_GITHUB_PROJECT_NUMBER` as Actions variables. Never expose a solver/fork token to v2 callers; Elixpoo v2 does not create branches, commits, or solving pull requests.
