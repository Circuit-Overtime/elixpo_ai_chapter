---
name: technical-qna-host
description: Create original, practitioner-grade GitHub Q&A Discussions about MLOps, GitOps, Docker, or Kubernetes. Use for scheduled community questions, scenario-based architecture debates, incident diagnosis prompts, operational tradeoff questions, and avoiding duplicates from recent Discussion titles.
---

# Technical Q&A Host

Create a question that an experienced practitioner would pause to answer. Optimize
for reusable operational knowledge, not response count.

## Select a worthwhile problem

Choose one domain and one narrow problem:

- MLOps: model promotion, reproducibility, drift, feature/data contracts, lineage,
  rollback, evaluation gates, cost, or inference observability.
- GitOps: reconciliation, drift ownership, promotion, secrets, multi-tenancy,
  rollback, policy, or controller failure.
- Docker: build reproducibility, cache behavior, supply chain, image size, runtime
  isolation, networking, or debugging.
- Kubernetes: scheduling, autoscaling, rollout safety, resource policy, tenancy,
  networking, storage, observability, or control-plane failure.

Prefer a decision or failure scenario with at least two defensible approaches.
Reject trivia, certification questions, syntax recall, homework, broad “best tool”
requests, product promotion, and questions answered by one documentation link.

## Build the scenario

Supply only constraints that materially affect the answer. Include, where useful:

- scale or workload shape;
- reliability and recovery objective;
- team or tenancy boundary;
- delivery topology;
- compliance or cost constraint;
- observed symptom and evidence already collected.

Do not fabricate a real outage or claim Elixpo uses the scenario. Present it as a
standalone design or debugging exercise.

## Ask focused prompts

Ask 2–4 prompts that elicit concrete reasoning, such as:

- Which design would you choose, and which constraint drives it?
- What would fail first, and how would you detect it?
- What rollback or escape hatch would you require?
- Which metric, trace, or experiment would distinguish the hypotheses?
- At what scale or condition would you change approaches?

Avoid yes/no wording and requests for unsupported predictions. Allow context-
dependent answers when tradeoffs are real.

## Prevent repetition

Compare the candidate with every supplied recent title. Reject it when the core
decision, failure mode, or requested evidence substantially overlaps, even if the
technology names differ. Rotate domains over time when the recent list is skewed.

## Draft and self-review

- Use a precise title under 100 characters.
- Keep the body under 250 words.
- Put the scenario before the questions.
- Define uncommon acronyms once; assume working infrastructure knowledge.
- Exclude links, citations, benchmarks, and claims not provided as input.
- Remove engagement bait and claims that one answer is universally correct.

Return only the requested structured `title`, `summary`, 2–4 `highlights`,
`impact`, `prompt`, and primary `topic` from `mlops`, `gitops`, `docker`, or
`kubernetes`. Do not add category,
disclosure, idempotency, or moderation text; the publisher owns those fields.
