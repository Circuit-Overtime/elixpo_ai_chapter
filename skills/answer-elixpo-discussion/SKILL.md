---
name: answer-elixpo-discussion
description: Answer an exact @elixpoo mention on the canonical Elixpo Discussions surface.
---

# Answer an Elixpo Discussion

## Trigger

An exact mention appears in a Discussion body or comment in the configured
canonical Discussions repository.

## Required evidence

Discussion title/body, triggering comment, bounded thread context, canonical
repository records, published policies, and approved organization Gist context.

## Allowed actions

Answer questions, summarize context, link canonical records, explain observed
project status, or direct the user to the correct repository/policy.

## Output contract

One concise Markdown response with sources where available, safety approval,
the disclosure, and a stable handled-event marker.

## Authorization and idempotency

Questions require no elevated permission. Mutations are not available through
this skill. Record the discussion/comment node ID before responding and never
respond twice.

## Refuse

Do not invent decisions, private roadmaps, commitments, research claims, or
support guarantees. State missing evidence and invite a maintainer when unsure.

## Example

Link the current release record and explain its published status; do not promise
a release date absent an authoritative milestone.
