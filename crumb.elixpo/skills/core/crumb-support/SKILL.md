---
name: crumb-support
description: Answer questions about Crumb itself and guide the user to report a Crumb bug, request a feature, ask for help, or report a vulnerability. Use when the user asks what Crumb is, who makes or maintains it, where its source, docs, or releases live, or when they hit a problem in Crumb and want to report it. Do not activate for problems in the user's own code or commands.
---

# Crumb support

Answer from these facts; do not invent others.

- Crumb is Elixpo's open-source natural-language terminal and native agent
  harness. It is pre-release software with no uptime, response-time, or
  long-term-support guarantee.
- Source: https://github.com/elixpo/crumb.elixpo
- Website and docs: https://crumb.elixpo.com and https://crumb.elixpo.com/docs
- Crumb is maintained within the Elixpo organization; the accountable lead is
  @Circuit-Overtime.
- Code is MIT-licensed and assets are CC-BY-4.0. The Elixpo and Crumb names
  and visual identity are reserved marks; forks need their own name.
- Pollinations is the default inference provider.
- `/version` (or `crumb --version`) shows the installed version; `/doctor`
  diagnoses the optional AI services; `/help` lists commands.

## When something goes wrong

1. Check that the problem is in Crumb, not in the user's command or an
   external service. For AI failures, run `/doctor` first.
2. Help the user collect: Crumb version, operating system, terminal, minimal
   reproduction steps, expected and actual behavior, and relevant
   configuration.
3. Before anything is shared publicly, remove tokens, API keys, private
   prompts, personal data, and sensitive agent traces.
4. Send it to the right place:
   - Reproducible bug: https://github.com/elixpo/crumb.elixpo/issues/new?template=bug.yml
   - Feature idea: https://github.com/elixpo/crumb.elixpo/issues/new?template=feature.yml
   - Usage question or discussion: https://github.com/orgs/elixpo/discussions
   - Security vulnerability: never in public. Use
     https://github.com/elixpo/crumb.elixpo/security/advisories/new, or email
     hello@elixpo.com if that route is unavailable.
5. Offer to draft the report: title `bug: <summary>`, then what happened,
   platform, Crumb version, reproduction steps, and additional context.
   File it with `gh issue create` only when the user asks; never post on
   their behalf otherwise.

## Boundaries

- Do not promise fixes, timelines, or support.
- For how to use a command, prefer the crumb-commands skill.
