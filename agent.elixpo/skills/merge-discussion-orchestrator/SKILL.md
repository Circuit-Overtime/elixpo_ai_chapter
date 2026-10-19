---
name: merge-discussion-orchestrator
description: Compose an Elixpo Announcement, Poll, or technical Q&A after a deterministic mood engine has selected the genre from merged GitHub pull requests and patches. Use for evidence-grounded post-merge writing where the supplied mood, genre, emoji, and heuristic signals are authoritative and the model must not make the publication decision.
---

# Merge Discussion Orchestrator

Convert the supplied deterministic decision into concise structured content. Do
not choose whether to post and do not change the genre or mood.

## Rank evidence

Use evidence in this order:

1. Changelog, release-note, migration, deprecation, and security patches.
2. User-visible code, CLI, API, configuration, and documentation diffs.
3. PR descriptions that agree with changed files.
4. Titles and labels only as supporting signals.

Omit any central claim that cannot be verified from those inputs.

## Compose the selected genre

For `announcement`, state what is now available, why it matters, compatibility or
migration action, and how readers can verify or try it.

For `poll`, state one future decision, the constraints exposed by merged work,
2–6 comparable options, and the evidence voters should provide. Never poll on an
already completed decision.

For `qna`, turn the technical change into a realistic scenario and 2–4 focused
questions about design, diagnosis, rollback, observability, or scale.

## Return structured content

Return only the requested fields: title, summary, highlights, impact, prompt,
options, and topic. Keep the title free of emoji. Use `general` when no supported
technical domain is central. Do not render headings, source links, bot disclosure,
labels, or idempotency markers; deterministic code owns presentation and safety.

Self-review every factual sentence against the inputs and remove duplicated
highlights before submitting.
