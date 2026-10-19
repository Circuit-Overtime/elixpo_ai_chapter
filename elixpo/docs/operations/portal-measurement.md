# Portal measurement boundary

**Status:** Active  
**Effective:** 2026-10-17

Elixpo measures whether its public directories help people reach useful work.
It does not build visitor profiles. The portal emits one event,
`elixpo_public_action`, with one of five controlled action categories:

| Category | What it measures |
| --- | --- |
| `adoption_click` | A visitor opens a project or operated-service dossier. |
| `task_claim` | A visitor follows a public issue or task route. |
| `discussion_participation` | A visitor follows an Elixpo Discussions route. |
| `package_access` | A visitor opens package installation, release, or registry material. |
| `research_artifact_access` | A visitor opens a paper, model, dataset, demonstration, or research dossier. |

Each event contains only the action category, current route, destination host,
whether the destination is external, and the public surface name. Query strings,
free-form text, GitHub handles, referrers, cookies, fingerprints, and persistent
visitor identifiers are excluded.

The browser adapter sends events to Cloudflare Zaraz when it is present. A
deployment may additionally set `NEXT_PUBLIC_ANALYTICS_ENDPOINT` to a
same-origin collector; cross-origin endpoints are rejected. Do Not Track and
Global Privacy Control disable both paths. A missing collector never blocks a
link or changes portal behavior.

Measurement reports must be aggregate. They may guide documentation,
navigation, and contribution-path improvements, but they must not be used to
rank contributors, infer identity, determine Chapter selection, or claim package
installation when only a link click was observed.
