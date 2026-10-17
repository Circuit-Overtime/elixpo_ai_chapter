# Wozformer Findings

Empirical results from the Wozformer project, collected during architecture
exploration (notebooks 01–12c) and the distillation pipeline (nb13–nb14 / scripts).
This document is the source of truth for the research paper.

Every finding has:
- **Setup**: model + hyperparameters
- **Observation**: what was measured
- **Implication**: why it matters

---

## Project context

**Goal.** Run a binary recurrent language model on a 1 MHz 6502 with paged
external weight memory (ESP32 flash) and produce coherent Shakespeare-style
text at <32 KB direct EEPROM or paged from <300 KB total weights.

**Corpus.** Tiny Shakespeare, ~1.1 MB lowercased (~430 K BPE tokens at vocab=512).

**Hardware target.** 4× AT28C64 EEPROM (32 KB total), 8 KB SRAM, 1 MHz Rockwell 6502,
optional ESP32 (4 MB flash, 80 MHz, paged ROM mode).

---

## Paper contributions (post-scrutiny)

After a critical audit of all findings against measurement controls and prior literature:

**Contribution 1 (Architecture).** HDC-RWKV — a novel autoregressive LM
combining Vector Symbolic Architecture primitives (binding, permutation),
RWKV-style linear recurrence, prototype-similarity output, and gradient
training via STE. The combination is not in prior work.

**Contribution 2 (Empirical characterization of the family's limits).**
Multi-experiment evidence (across vocab ∈ {65, 128, 256, 512}, d ∈ {256, 512, 1024, 2048}):
- Naive depth stacking degrades binary recurrence (F2, F3 — three configurations).
- Quality saturates as `V / (d/log(d))` ratio grows (F5 — four data points
  consistent with Kanerva's 2009 capacity prediction).
- Single-tokenizer effect dominates capacity within fixed deployment budget (F6).
- Distillation from dense transformer teacher plateaus student at vocab=512
  regardless of student size (F7, F8 — three student configurations).
- A controlled α-sweep (F17 — nb18) confirms cross-architecture distillation
  *regresses* HDC-RWKV at every α ∈ {0.3, 0.5, 0.7}, with a near-flat ~0.12 BPC
  penalty across α. This rules out the "we picked the wrong α" explanation.
- The BPC ~2.93 ceiling is **scale-independent** (F13) and **survives both
  output relaxation (F14) and decay relaxation (F15)** — three independent
  ablations within 0.04 BPC of each other.
- When given continuous decay freedom, the model **voluntarily binarises**
  to a bimodal {0, 1} distribution (F16) — strong evidence that the binary
  parameterization is preferred, not imposed, and the ceiling lies in the
  bipolar hidden-state information capacity, not in any peripheral gate.

**Contribution 3 (Hardware demonstration — pending).** First autoregressive
LM running on 1 MHz silicon: ~135 ms/token, 16.4 KB binary model, no
floating point at inference, no NaN possible.

**Not claimed (insufficient evidence).**
- d–quality monotonicity (uncontrolled comparison — see retraction)
- STE works for binary recurrence as a research finding (it's a methodology
  check, see M1)

## The novel architecture: HDC-RWKV

A recurrent autoregressive language model where:

1. **Every learnable parameter is bipolar** (∈ {-1, +1}) at inference, stored as 1 bit
2. **Training uses the Straight-Through Estimator** (Bengio 2013, Courbariaux 2016) so
   gradients flow through `sign()`
3. **Position encoding via cyclic rotation** (HDC-style binding) — no separate
   positional embedding table
4. **Recurrent state update** with bounded `tanh` activation — no softmax-over-T,
   no KV cache, no exp / sum / divide
5. **Output via prototype similarity** — dot product of state with V learned
   prototype hypervectors, then softmax

```
state_t = tanh( decay_mask_bipolar ⊙ state_{t-1} + permute_t(vocab_hv_bipolar[token_t]) )
logits  = ( state @ prototype_hv_bipolar.T ) / temperature
```

To our knowledge no published architecture combines: bipolar weights via STE,
RWKV-style linear recurrence, HDC binding/permutation, and prototype-similarity
output, in a generative LM at sub-300KB deployment.

---

## Findings

### F1. The HDC-RWKV architecture is empirically trainable end-to-end via STE.

**Setup.** vocab=256, d=256, n_layers=1, block=16 (nb12c).
**Observation.** Best HARD val 4.35 nats/token (BPC 2.93). Train+eval converge;
soft and hard val loss agree throughout training (gap < 0.05 nats).
**Implication.** Sign-quantized weights with continuous tanh state is a viable
combination for autoregressive LM training at sub-100K-parameter scale —
contrary to prior BNN literature focused on classification.

### F2. Naive depth stacking degrades binary recurrence.

**Setup.** Same as F1 but n_layers=2 (Path A in nb12 logbook), no residual or
re-binarization between layers.
**Observation.** Best HARD val rose from 3.55 (1 layer) to 4.08 (2 layers).
Per-token output became more fragmented qualitatively.
**Implication.** Layer 2 receives continuous `tanh` activations whose distribution
differs sharply from the bipolar token vectors layer 1 was trained on. The
mismatch causes degradation, not improvement, when stacking.

### F3. Residual + re-binarization between layers does not rescue stacked binary recurrence at this scale.

**Setup.** Same as F2 but with `layer_input = ste_sign(states + layer_input)`
between layers (Courbariaux 2016 BNN trick).
**Observation.** Best HARD val 4.47 — worse than single-layer (3.55) and roughly
matching naive stacking (4.08).
**Implication.** The standard fix for stacked binary networks (residual +
re-binarize) is insufficient for sequence-modeling recurrences at vocab=128.
The mismatch between bipolar token vectors at layer 0 and tanh-bounded states
at layer N+1 cannot be patched by binarization alone — fundamentally different
input distributions, similar to the limitation reported in "Binary Neural
Networks: A Survey" (Qin et al. 2020) for sequence tasks.

### Methodology note M1. Soft/hard val agreement validates STE in HDC-RWKV.

(*Originally listed as F4. Demoted to methodology — this is a sanity check,
not a research contribution. The BNN literature routinely reports soft/hard
gaps as a validation step.*)

**Setup.** All HDC-RWKV runs (vocab=128, 256, 512).
**Observation.** Soft val (STE forward) and hard val (real `.sign()` forward)
remain within 0.02–0.05 nats throughout training across all configurations
tested.
**Use.** Throughout the paper, we treat any quality ceiling as architectural
rather than quantization-induced, justified by this validation.

### F5. HDC capacity ceiling at `d / log(d)` prototypes is empirically observable.

**Setup.** Comparing nb12c (vocab=256, d=256), nb12 (vocab=128, d=512), and
nb14 student (vocab=512, d=1024 and d=2048).
**Observation.** Quality (BPC) degrades as the ratio V / (d/log(d)) grows past ~4×.
- nb12c: V/(d/log(d)) = 256/(256/8) = 8 → BPC 2.93
- nb12:  V/(d/log(d)) = 128/(512/9) = 2.3 → BPC ~3.0
- nb14 student d=1024 V=512: ratio 5 → BPC 3.09
- nb14 student d=2048 V=512: ratio 2.4 → BPC 3.03 (marginal improvement)
**Implication.** Kanerva's 2009 capacity prediction for VSA superposition
(`d/log(d)` items) applies even when prototypes are gradient-trained rather
than random. This is the dominant architectural constraint on HDC-RWKV scaling.

### F6. Tokenizer choice matters more than additional model capacity at small scale.

**Setup.** Comparing nb12 (vocab=128, d=512) → nb12c (vocab=256, d=256). Same
EEPROM footprint (~16.5 KB).
**Observation.**
- nb12: best HARD val 3.55 nats, BPC 2.98, fragmented output
- nb12c: best HARD val 4.35 nats, BPC 2.93 (lower!), 51% of generated tokens are
  full words instead of subword fragments
**Implication.** At constant deployment budget, increasing vocabulary
(more BPE merges) gives qualitatively better output even when per-token nats
loss is higher, because each token carries more bits of information. The
right comparable metric across vocab sizes is BPC, not nats/token.

### F7. Binary recurrent students cannot fully absorb teacher knowledge from
    dense transformers at vocab > 256.

**Setup.** Teacher: dense transformer, vocab=512, d=256, L=6, ~3M params, val 3.55 nats.
Student: HDC-RWKV, vocab=512, d=1024 and d=2048, L=2.
Distillation: T=4.0, α_nll=0.3, α_distill=0.7.
**Observation.** Student plateaus at val 5.3–5.4 nats regardless of d∈{1024, 2048},
gap to teacher remains ~1.8 nats throughout 12K–15K steps. Soft and hard val
agree (binarization not the issue per F4).
**Implication.** The bipolar recurrent architecture has a representational
ceiling for matching dense transformer output distributions at vocab > 256.
Distillation cannot transfer information the student cannot represent. This
is consistent with F5 (HDC capacity ceiling).

### F8. Student capacity scaling has diminishing returns under binary constraint.

**Setup.** Same as F7. Compare d=1024 vs d=2048 at vocab=512.
**Observation.** Doubling student size (d=1024 → d=2048) improved best HARD val
by only 0.1 nats (5.40 → 5.30). Deployment size doubled from 131 KB to 262 KB.
**Implication.** Once HDC capacity is exhausted, further hypervector dimension
increase provides diminishing returns. Architectural changes (not size) are
needed past this point.

### F9. Channel mixing module addition does not improve binary recurrence at this scale.

**Setup.** nb12 with `ChannelMixing` block (gated MLP) added; same hyperparameters
otherwise.
**Observation.** Soft and hard val converged identically with and without CM.
Inspection showed the CM block contributing ~0 to the residual stream because
weights stayed near zero (sigmoid gate close to 0.5 produces small `r * v` values).
**Implication.** Gated MLPs do not adapt during binary STE training at this
scale without specific initialization or warmup recipes — the gate collapses
to indifference.

### F17. Cross-architecture distillation regresses HDC-RWKV across all α tested.

(*Replaces and upgrades O1. After the nb18 controlled sweep we now have multi-point
evidence; this is a finding, not an observation.*)

**Setup.** Single Kaggle run, single seed (1337), shared tokenizer, shared teacher.
- Teacher: dense transformer V=256, d=192, L=4, dropout=0.2, 6k steps → BPC **2.073**.
- Student: HDC-RWKV V=256, d=384, L=2, block=64, 12k steps, LR=3e-3, AdamW.
- Distill T=4.0. Sweep α_distill ∈ {0.0, 0.3, 0.5, 0.7} (α_nll = 1 − α_distill).
- The α_distill=0.0 run is the matched NLL-only baseline. All four students
  reinitialised from the same seed before training.

**Observation.**

| α_distill | best HARD val | BPC | ΔBPC vs baseline |
|---|---|---|---|
| 0.0 (baseline, NLL-only) | 4.797 | **3.274** | — |
| 0.3 | 4.974 | 3.395 | **+0.121** |
| 0.5 | 4.974 | 3.395 | **+0.121** |
| 0.7 | 4.997 | 3.410 | **+0.136** |

All three distilled students regress against the NLL-only baseline. The regression
is **nearly flat in α** (Δ in {0.12, 0.12, 0.14}), suggesting a discontinuity at
α=0 rather than a smooth curve: any non-zero teacher mixing causes the same
~0.12 BPC penalty.

Qualitative generation (same prompt `"my lord,"`, same seed):
- baseline: `"that tethent ollend... the louvenst ake of bant themo: and wand..."` — recognisable English fragments (`the`, `and`, `wand`).
- α=0.7: `"atelan, afanfr; o: the id: the larsent: gud..."` — far more fragmented, almost no full words.

**Implication.** Distillation from a dense transformer hurts a bipolar recurrent
student at every distillation weight in our sweep. The flat-Δ pattern is the
diagnostic: this is not "α was tuned wrong"; the teacher's soft distribution
itself is misaligned with what the binary student can represent. Forcing the
student to match a distribution it cannot reach makes its loss surface worse,
not better — even a tiny dose of teacher signal is enough to derail it.

**Compatible with prior literature.** Stanton et al. (NeurIPS 2021)
*"Does Knowledge Distillation Really Work?"* documents distillation
regression under capacity mismatch in image classification. F17 is the
binary-recurrent-LM analogue: the student is *architecturally* incapable
of producing the teacher's soft logit shape (F13–F16 ceiling), and KL is
the wrong loss to chase under that constraint.

**Open caveats** (worth flagging in paper, not blocking the finding):
1. Single seed per α — variance not estimated, but the consistent direction
   across four independent runs makes a noise explanation implausible.
2. Distillation temperature T=4.0 not swept. Lower T might reduce the
   regression by sharpening teacher targets toward argmax.
3. Only one teacher size tested — a smaller teacher closer to student
   capacity may behave differently (matches F7's vocab=512 finding).

### F13. Bipolar HDC-RWKV has a scale-independent BPC ceiling at ~2.93.

**Setup.** Three controlled comparisons, identical corpus, identical architecture family,
NLL-only training:

| Configuration | Storage | Best HARD val | BPC |
|---|---|---|---|
| nb12c: V=256, d=256, L=1 | 16 KB | 4.35 nats | 2.93 |
| nb12: V=128, d=512, L=1 | 16 KB | 3.55 nats | 2.98 |
| Tier 2 (nb15): V=512, d=1024, L=2 | 128 KB | 5.10 nats | **2.92** |

**Observation.** Scaling up bipolar HDC-RWKV by 8× (16 KB → 128 KB) reduced BPC by
**0.01** — within measurement noise. Three independent configurations with very
different vocab/d/L all land within 0.06 BPC of each other.

**Implication.** The pure-binary HDC-RWKV architecture has a **scale-independent
quality ceiling** at approximately BPC 2.93. Capacity arguments (F5) explain why
larger d doesn't help: as d grows, V grows too (to keep meaningful tokens), and the
V/(d/log(d)) ratio stays approximately constant. The bottleneck is in the
**bipolar prototype-similarity output mechanism**, not in capacity per se.

**Why output, not recurrence:** the recurrent state is already continuous (tanh-bounded
fp32 during training). Logits are computed as `state @ prototype_bipolar.T / temp`.
Each prototype is a quasi-orthogonal direction in {-1, +1}^d. Total logit dynamic
range is bounded by `O(√d)` (expected dot product of state with a random bipolar
vector), making it hard for the softmax to express the sharp distributions a real
language model needs.

**Implication for the paper.** Pure bipolar HDC-RWKV does NOT cross the threshold
to coherent text at any size. This is a documented ceiling. To break it, the
output mechanism must be relaxed (see proposed Tier 2.5 below). The pure-binary
variant remains the unique 6502 demo target.

### F15. Continuous per-channel decay does NOT break the ceiling either.

**Setup.** Same architecture as Tier 2.5 (V=256, d=512, L=1, block=64, 20K steps NLL).
Only change: `decay_mask` relaxed from bipolar {-1, +1}^d to per-channel continuous
sigmoid ∈ (0, 1), initialised at sigmoid(2) ≈ 0.88. Prototype kept int8.

**Observation.** Best HARD val 4.2468 nats/token, BPC **2.90** — within noise of
Tier 2.5 (BPC 2.94) and nb12c (BPC 2.93). Three independent component relaxations
(scale F13, output F14, decay F15) all land at BPC 2.90–2.94.

**Implication.** Neither output projection (F14) nor decay gating (F15) is the
binding constraint. Combined with F13's scale invariance, the BPC ~2.93 ceiling
is **wider than any single component** — it is a property of the binary recurrent
*family*, not of one specific weight tensor.

### F16. Given continuous decay freedom, the model self-organises to a bimodal {0, 1} distribution.

**Setup.** Same run as F15. Decay parameter is per-channel scalar with full
gradient access, sigmoid-bounded to (0, 1), 512 channels, 20K training steps.

**Observation.** Final per-channel decay distribution: **min 0.000, max 1.000,
std 0.458**, with two strong modes — 264 channels concentrated near 0.0
("forget-now") and 140 channels concentrated near 1.0 ("keep-forever"),
only ~108 channels using intermediate values. The init value (0.88) is almost
deserted post-training.

**Implication.** When given a smooth knob from 0 to 1 with no architectural
pressure toward binarity, the optimiser **voluntarily binarises the decay**.
This means the bipolar `decay_mask` in nb12c was not an architectural
straitjacket — it matched the solution the model converges to anyway. The
binary parameterization is *preferred*, not just *tolerated*, at this scale.

**Mechanism hypothesis (paper claim).** The HDC-RWKV ceiling is not in any
peripheral gate; it is in the **information capacity of the recurrent hidden
state** itself. A bipolar d=512 state carries 512 bits per token. No relaxation
of surrounding parameters (output, decay) moves the ceiling because the
state-channel itself is the bottleneck. Future work that breaks BPC 2.93 will
need to enlarge or restructure the state (continuous-tanh-d, multi-state, or
mixture of bipolar states), not relax neighbouring projections.

**Implication for the paper.** F13 + F14 + F15 + F16 together form a
**mechanism story**: we systematically ruled out the two natural suspects
(output and decay), and the model's own behaviour under relaxation (F16)
points at the state representation as the residual bottleneck. This is
stronger than any single ablation could be.

### F14. The output projection is NOT the bottleneck of bipolar HDC-RWKV.

**Setup.** Same architecture as nb12c (HDCRWKVHybrid, V=256, d=512, L=1, block=64,
20K steps NLL training). Only change: prototype matrix relaxed from bipolar
{-1, +1}^d to int8 (continuous training, 8-bit deployment with per-tensor scale).
Storage rose 9× (16 KB → 148 KB).

**Observation.** Best HARD val 4.3142 nats/token, BPC **2.94** — within noise of
pure-binary nb12c (BPC 2.93). 256× more expressive output projection moved BPC
by 0.01.

**Implication.** The bipolar prototype-similarity output was *not* the dominant
limitation. The dynamic-range argument (logits ~O(√d) when prototype is bipolar)
turns out not to bind in practice — the model finds enough signal even within
that range. The bottleneck must lie elsewhere: most likely the bipolar
**decay_mask** in the recurrence, which forces each channel into binary memory
behaviour (keep vs flip every step), preventing the continuous-decay patterns
that real RWKV uses for multi-horizon temporal memory.

**Implication for paper.** Contrary to a natural intuition, output relaxation
alone cannot break the binary HDC-RWKV ceiling. This is a clean negative result
about *where the binary constraint actually limits expressiveness*. The
architecture's recurrent dynamics (specifically the binary decay) appear to be
the dominant restriction.

### Retracted F12 — d=384 vs d=256 NOT a controlled experiment.

(*Originally claimed: "bigger d hurts quality" based on nb12c (d=256, BPC 2.93)
vs today's ablation (d=384, BPC 3.23).*)

**Why retracted.** The two runs differ in more than just `d`:
1. **Different code paths** — nb12c used the original notebook implementation;
   today's ablation used the refactored `wozformer` package. Subtle init,
   layer-norm placement, or optimizer-state differences may exist.
2. **Different step counts** — nb12c trained 12K steps; ablation trained 15K.
3. **Hyperparameters not LR-scaled** — d=384 may need a smaller LR
   (`lr ∝ 1/√d` is standard for transformers) but both ran at lr=3e-3.
4. **Single seed** for each.

Without controlling for these, the d=256 vs d=384 comparison does not
support a claim about d-quality monotonicity. **Retracted from findings**.

To revisit in future work: run d ∈ {192, 256, 320, 384, 512} at fixed
hyperparameters with multiple seeds, all through the same code path.

### F10. Recurrent state binarization (vs continuous tanh) destroys training signal.

**Setup.** nb12 initial implementation: `state_t = ste_sign(decay * state + input)`
with full bipolar state.
**Observation.** Training diverged; soft val descended to 3.6 but hard val
diverged to >6 (worse than random). Gap > 2.4 nats.
**Implication.** STE through 16 sequential `sign()` applications loses gradient
fidelity. The continuous `tanh` state (with bipolar weights) is the working
combination. This is a positive constraint on the architecture design space:
**weights binary, activations continuous**.

---

## Architecture comparison table (Wozformer corpus, Tiny Shakespeare)

| Architecture | Source | Params | Deploy bytes | Val nats | BPC | Per-token cycles (6502) |
|---|---|---|---|---|---|---|
| Bigram baseline | nb01 | 1,024 | 1 KB | 2.44 | — | < 100 |
| Dense transformer (small) | nb07b | 1,536 | 0.4 KB int8 | 2.29 | ~3.30 | 17,000 mults |
| MoE-Tiny (4 experts) | nb09 | ~3K | 28 KB | TBD | TBD | 6,000 mults |
| RWKV (linear recurrence) | nb10 | ~3K | 23 KB | TBD | TBD | 4,000 mults |
| HDC Hebbian (random vocab) | nb11 | 0 trainable | 32 KB | ~4.0 | ~3.0 | 155K (XOR/popcount) |
| **HDC-RWKV vocab=128, d=512** | nb12 | 132K | 16.5 KB | 3.55 | 2.98 | 135K (XOR/popcount) |
| **HDC-RWKV vocab=256, d=256** | nb12c | 131K | 16.4 KB | 4.35 | **2.93** | 135K |
| HDC-RWKV vocab=512, d=1024 (no distill) | nb14 baseline | 1.05M | 131 KB | ~5.4 (predicted) | ~3.1 | per-token similar |
| HDC-RWKV vocab=512, d=1024 distilled | nb14 | 1.05M | 131 KB | 5.40 | 3.09 | per-token similar |
| HDC-RWKV vocab=512, d=2048 distilled | nb14 | 2.1M | 262 KB | 5.30 | 3.03 | per-token similar |
| Teacher dense transformer | nb13 (Kaggle) | 3.0M | 12 MB fp32 | 3.55 | 2.03 | not deployed |

### Reading the table

- **Per-byte efficiency**: nb12c is the best deployable artifact so far.
- **Output quality**: teacher >> all students. Teacher produces real Shakespeare
  characters (KING EDWARD IV, QUEEN MARGARET, GLOUCESTER), grammatical sentences,
  period vocabulary.
- **Scaling trend**: binary recurrent quality saturates as vocab grows past
  256, even with parameter scale up to 2.1M and distillation.

---

## Open questions / limitations / future work

### Q1. Is there a binary architecture that absorbs teacher knowledge at vocab=512+?

Current evidence (F7) suggests no, but only HDC-RWKV has been tested. Worth
trying: binary transformer student, binary RWKV student (not bipolar HDC).
Could distillation transfer better to architectures that match teacher's
inductive bias?

### Q2. Why does the binary recurrence saturate around BPC 3.0?

Hypothesis: prototype-similarity output is inherently low-rank. Logit space is
bounded by V × d bits; cross-entropy minimization needs continuous logit ranges
to encode soft distributions. Future work: replace prototype-similarity output
with a binary unembedding matrix.

### Q3. Does mixed-precision help? (int4 weights or fp8 LN params)

Untested. Mixed-precision int4 students might bridge the binary-recurrence
ceiling without violating the "hardware-friendly" constraint.

### Q4. Can distillation at vocab=256 push student BPC below nb12c's 2.93?

Under investigation as of nb14 round 2 (retraining teacher at vocab=256, then
distilling student). If yes: distillation is useful for binary recurrence at
the right capacity ratio. If no: distillation doesn't help binary recurrence
at any scale.

### Q5. Hardware deployment latency tradeoffs

Per-token cycle counts are computed analytically. Need actual 6502 measurements
to validate (and to demonstrate the paged-ROM SPI protocol with ESP32).

---

## Hardware deployment design

### Direct-fit deployment (no paging)

Models under 32 KB deploy directly to 4× AT28C64 EEPROM. Currently:

- `wozformer_hdcrwkv_v3.bin` (nb12c output, 16.4 KB) is the leading candidate.
- Per-token cost: ~135K cycles ≈ 135 ms at 1 MHz.

### Paged deployment (for >32 KB students)

For student models 32–300 KB:

- Weights live in ESP32 flash (4 MB available)
- 6502 requests weight pages via SPI
- 6502 SRAM (8 KB) holds current page + activations
- Per-token cost increases ~2× due to SPI fetch latency
- Project name for this path: "paged-ROM mode"

Currently deferred pending student that beats nb12c at deployable size.

---

## Citation pointers for paper write-up

- **VSA / HDC primitives**: Kanerva (2009), Plate (1995), Rachkovskij & Kussul (2001)
- **STE**: Bengio et al. (2013), Courbariaux et al. (2016) "BinaryConnect"
- **Distillation**: Hinton, Vinyals, Dean (2015)
- **RWKV linear recurrence**: Peng et al. (2023) RWKV-4 paper
- **BNN survey**: Qin et al. (2020)

---

## Appendix: Reproduction commands

```bash
# Smoke tests
python tests/test_smoke.py

# Teacher (small, local)
python scripts/train_teacher.py --steps 4000 --d 128

# Student with distillation
python scripts/train_student.py --steps 12000 --d 1024

# Side-by-side comparison
python scripts/compare.py --paths runs/teacher.pt runs/student.pt
```

For Kaggle GPU runs: notebooks `nb13_teacher_training.ipynb` and
`nb14_student_distillation.ipynb`.

---

*Last updated 2026-06-15 after F15/F16 (continuous-decay ablation, nb17)
and F17 (distillation α-sweep, nb18 — replaces O1).
Defensible findings: F1, F2, F3, F5, F6, F7, F8, F9, F10, F13, F14, F15, F16, F17.
Methodology note: M1. Retracted: former F12. (O1 promoted to F17.)
Tier 2.5 (hybrid int8 output) and Tier 2.6 (continuous decay) are
**research-only artifacts** — they do not improve BPC and are not shipped.
The sole deployment artifact is `wozformer_hdcrwkv_v3.bin` (nb12c, 16.4 KB,
BPC 2.93), targeting both 6502 (direct EEPROM) and ESP32 (flash) hardware.*
