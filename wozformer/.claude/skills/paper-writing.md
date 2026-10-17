---
name: paper-writing
description: Guidance for drafting/editing the Wozformer research paper (Springer LNCS). Enforces evidence-anchored claims, formal tone, and figure/equation discipline.
---

# Paper-writing skill (Wozformer)

Use this skill when drafting or editing any section of `docs/paper/paper.tex`,
`docs/paper/PAPER_TRACKING.md`, or `docs/paper/references.bib`.

## Non-negotiables

1. **Every empirical claim in the paper must map to a finding in
   `docs/findings.md`.** If it doesn't, either add the finding there first
   (with setup, observation, implication) or don't make the claim.
2. **Never claim more than the evidence supports.** Single-point
   observations stay softened ("in our tested configuration…"). Sweeps
   allow generalisation.
3. **No em-dashes, no marketing tone.** Formal academic register.
4. **Every figure gets a real caption** — one sentence stating what the
   figure shows, one sentence stating why it matters.
5. **Every equation is numbered and referenced.** No dangling equations.
6. **STE, bipolar, hypervector, prototype, decay** — define on first use,
   then use consistently. Do not switch synonyms mid-paper.

## Structural conventions

- Section 1 (Introduction) must contain: motivation paragraph, research
  question (labelled RQ), 4 boxed contributions, flowchart figure.
- Section 2 (Related work) must contain a comparison table.
- Section 3 (Method) must reference Equations 2–4 and Figure 2 (block
  diagram).
- Section 5 (Results) leads with the summary table, then per-finding
  subsections; each subsection ends with the paper-level implication.
- Every negative result gets a mechanism paragraph (not just "we tried X,
  it didn't work"). The mechanism is what makes it publishable.

## Citation rules

- HDC: cite Kanerva 2009, Plate 1995, Rachkovskij & Kussul 2001.
- STE: Bengio et al. 2013; Courbariaux et al. 2016 (BinaryConnect).
- BNN survey: Qin et al. 2020.
- RWKV: Peng et al. 2023.
- Distillation: Hinton, Vinyals, Dean 2015.
- Distillation regressions: Stanton et al. NeurIPS 2021.

Do not cite anything not in `references.bib` without adding it first.

## What to skip

- Do not write "state of the art" or "novel approach" verbatim — show the
  gap in Related work, let the reader draw the conclusion.
- Do not repeat the diagram in text form. Diagrams show structure; text
  explains what the diagram cannot.
- Do not write hypothetical future-work paragraphs longer than the actual
  future work section (§8.2).

## When editing an existing section

1. Read `PAPER_TRACKING.md` first — check the section is marked as
   in-progress or draft.
2. Do not silently remove a paragraph that discusses a finding without
   also removing the finding from the tracking table's cite-list.
3. When a finding is downgraded (F → observation) update all three of:
   `findings.md`, `PAPER_TRACKING.md`, and any section text that cited it.

## When adding a new claim

1. First add it as a finding (Fxx) in `findings.md` with a proper Setup /
   Observation / Implication triplet.
2. Add it to the cite-list in `PAPER_TRACKING.md`.
3. Only then reference it in the paper text.
