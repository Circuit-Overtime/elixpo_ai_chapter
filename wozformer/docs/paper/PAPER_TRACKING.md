# Wozformer paper — tracking checklist

Single source of truth for what must be in the paper, in what order, and where the evidence lives. Every item here is either **done**, **in progress**, or **blocked** — no silent tail. Update this file as sections land.

Cross-references:
- `docs/findings.md` — the empirical claims (F1–F16, M1, O1) we're allowed to cite.
- `docs/figures/` — TikZ figures.
- `wozformer/models/hdc_rwkv.py` — the shipping architecture code.

---

## Structural checklist (Springer LNCS)

| §     | Section                       | Status  | Owner | Notes |
|-------|-------------------------------|---------|-------|-------|
|       | Title, authors, affiliation   | ✅ done  | user  | Bhattacharya + Gazi filled |
|       | Abstract                      | ✅ draft | claude | ~200 words, 4 contributions summarised |
| 1     | Introduction                  | ✅ draft | claude | RQ, Eq. 1–2, TikZ flowchart, boxed contributions |
| 2     | Related work                  | ✅ draft | claude | HDC, BNN, RWKV, distillation; Table 1 comparison |
| 3     | Method                        | ✅ draft | claude | corpus, arch, loss, ablation lineage; 6 equations |
| 3.1   | Tokeniser & vocab choice      | ✅ draft | claude | F6 justification for V=256 |
| 3.2   | Architecture (bipolar HDC-RWKV) | ✅ draft | claude | Eq. 3–5, compact diagram placeholder |
| 3.3   | Training loss                 | ✅ draft | claude | Eq. 6 NLL + Eq. 7 KD |
| 3.4   | Ablation lineage: what we tried and dropped | ✅ draft | claude | 6 rejected variants listed inline |
| 4     | Experimental setup            | ✅ draft | claude | Table 2 hyperparams, seeds, hardware |
| 5     | Results                       | ✅ draft | claude | main table + 4 finding subsections + samples |
| 5.1   | Baseline vs ours              | ✅ draft | claude | Table 3 (bigram, dense, HDC-Hebbian, ours, teacher) |
| 5.2   | Scale-independent ceiling (F13) | ✅ draft | claude | Table 4 (3 configs) |
| 5.3   | Ruling out output (F14)       | ✅ draft | claude | int8 prototype ablation prose |
| 5.4   | Ruling out decay (F15) + self-binarisation (F16) | ✅ draft | claude | mechanism paragraph |
| 5.5   | Distillation α-sweep (F17)    | ✅ draft | claude | Table 5 (4-point sweep) |
| 5.6   | Generation samples            | ✅ draft | claude | Table 6, teacher/nb12c/distilled |
| 6     | Analysis / Discussion         | ✅ draft | claude | bipolar-state capacity hypothesis; 4 future directions |
| 7     | Deployment design             | ✅ draft | claude | 6502 memory map, XOR/popcount, ESP32 paged mode |
| 8     | Conclusion & future work      | ✅ draft | claude | contributions restated + 4 future directions |
|       | References                    | ✅ draft | claude | 15 entries in references.bib |
|       | Appendix A: worked example    | ✅ done  | claude | walkthrough.tex referenced; expanded poster referenced |

**Current status: full draft compiles clean, 16 pages, 0 undefined references.**
Remaining work: wire figures via `\includegraphics`, fill generation samples for
Table 6 (currently placeholder text), install `llncs.cls` for final Springer
formatting (drop from 16 pages to ~13).

---

## Figures — every planned figure and its source

| Ref | Name / caption                    | Source                                 | Status |
|-----|-----------------------------------|----------------------------------------|--------|
| F1  | Research flowchart (in §1)        | inline TikZ in paper.tex               | ✅ done |
| F2  | Compact HDC-RWKV block diagram    | `docs/figures/architecture_hdc_rwkv.tex` | ✅ done |
| F3  | Expanded architecture poster      | `docs/figures/architecture_hdc_rwkv_expanded.tex` | ✅ done (appendix candidate) |
| F4  | Scale invariance bar chart (F13)  | from nb12c / nb12 / nb15 results       | ☐ TODO |
| F5  | Ablation ladder table-as-figure   | F13/F14/F15 combined                   | ☐ TODO |
| F6  | Decay self-binarisation histogram | from nb17 run (already captured)       | ☐ TODO — pull from screenshot |
| F7  | Capacity ratio curve (F5 finding) | 4 data points                          | ☐ TODO |
| F8  | Distillation α-sweep              | nb18 output                            | ☐ blocked |
| F9  | Generation samples table          | teacher + nb12c + student              | ☐ TODO |
| F10 | 6502 memory map                   | firmware planning                      | ☐ optional |

## Equations — every equation the paper commits to

| Eqn | Content                                                             | Section |
|-----|---------------------------------------------------------------------|---------|
| 1   | Deployment byte accounting: bytes = (2Vd + Ld)/8 + 2                 | §1 or §3.2 |
| 2   | Bipolar embedding + position binding: h_t = ρ^t(sign(V_hv)[x_t])     | §3.2   |
| 3   | Recurrence: s_t = tanh(sign(m) ⊙ s_{t-1} + h_t)                      | §3.2   |
| 4   | Prototype-similarity logits: z_t = sign(P_hv) s_t / τ                | §3.2   |
| 5   | Cross-entropy loss                                                   | §3.3   |
| 6   | Distillation loss (α-NLL + α-KL Hinton)                              | §3.3   |
| 7   | XOR–popcount identity: ⟨a,b⟩ = d − 2·popcount(ā ⊕ b̄)               | §7 / appendix |

## Findings we commit to citing (paper says only these are ours)

All from `docs/findings.md`. Do not claim anything else without adding it there first.

- ✅ F1 (trainability)
- ✅ F2, F3 (depth stacking degrades)
- ✅ F5 (capacity ratio)
- ✅ F6 (tokeniser dominates)
- ✅ F7, F8 (distillation plateau; single-α caveat noted)
- ✅ F9 (channel mixing null)
- ✅ F10 (state binarisation destroys training)
- ✅ F13 (scale-independent ceiling)
- ✅ F14 (output not the bottleneck)
- ✅ F15 (decay not the bottleneck)
- ✅ F16 (self-binarisation under continuous freedom)
- M1 methodology only
- O1 single-point observation — upgraded to F17 pending nb18
- Retracted: F12

## Novelty claims (repeat verbatim in Abstract, Intro, Conclusion)

1. First generative LM combining HDC binding + RWKV recurrence + bipolar STE + prototype-similarity output at sub-16 KB deployment.
2. Scale-independent BPC ceiling in binary recurrent LMs (F13) with three independent ablations (F14, F15, F16) locating the bottleneck in the bipolar hidden state capacity, not in peripheral gates.
3. When granted continuous decay freedom, the model self-organises to a bimodal {0, 1} distribution (F16) — evidence that the binary parameterisation is preferred, not imposed.
4. (If hardware ships) End-to-end demonstration of a modern-architecture LM on a 1 MHz Rockwell 6502 with 32 KB of ROM and 8 KB of SRAM.

## Non-goals (explicitly out of scope, so we don't defend them)

- Beating dense transformer BPC — we won't.
- Multi-language, non-English corpora.
- Efficient training regimes (we accept expensive training for cheap deployment).
- Novel STE variants — we use standard clipped STE.

## User decisions still needed

- [ ] Venue: LNCS default; confirm or swap to CCIS/IJCAI/arXiv only.
- [ ] Author names + affiliations.
- [ ] Include hardware section? (Y/N — decides scope of §7)
- [ ] Distillation section: keep as O1 observation, or wait for nb18 α-sweep?
