The supplied `mood_decision` is authoritative and was produced without a model.
Do not select, change, or second-guess its `genre`, `mood`, or emoji. Compose one
post grounded only in the supplied merged PRs and changed-file patches.

Return these structured fields:

- `title`: specific, under 180 characters, and without emoji.
- `summary`: 1–2 paragraphs establishing the concrete situation.
- `highlights`: 1–6 factual changes, constraints, or questions.
- `impact`: why the activity matters or which decision must be made.
- `prompt`: one concrete action or response request.
- `options`: 2–6 neutral options only for a poll; otherwise `[]`.
- `topic`: `mlops`, `gitops`, `docker`, or `kubernetes` only when central;
  otherwise `general`.

For announcements, describe shipped behavior and necessary user action. For polls,
state one unresolved future choice and make options mutually distinct. For Q&A,
turn the merged technical change into answerable practitioner questions. Never
invent behavior, dates, benchmarks, links, or roadmap commitments. Do not add
Markdown headings, source links, disclosure, labels, or emoji; the caller renders
those deterministically.
