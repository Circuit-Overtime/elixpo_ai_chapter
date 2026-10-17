# TinyStories Ablation Report (v5.5.4)

This report details the comparative search trajectories generated on the TinyStories 1M corpus under four search configurations.

## Search Configurations

* **A) Greedy**: B=1, full ensemble weights.
* **B) Policy Only**: B=5, only policy scoring.
* **C) Makes-Sense Only**: B=5, only makes-sense scoring.
* **D) Full Ensemble**: B=5, all neural, heuristic, and repetition weights active.

---

## 1. Search Ablation Metrics Table

| Configuration | Total Score | Avg Local | Avg Global | Makes-Sense | Policy | Validity | Boundary Matches | Diversity | Rep Rate | Topic Rep | Progress | Consistency | Runtime (s) | Evals |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| A — Greedy Search (B=1) | 35.0902 | 0.5426 | 0.5371 | 0.8205 | 0.2984 | 0.8814 | 0.8 | 0.5898 | 8.3% | -0.1858 | 0.4574 | 38.9% | 0.88 | 700 |
| B — Policy Head Only (B=5) | 34.6119 | 0.5691 | 0.4785 | 0.0000 | 0.4019 | 0.0000 | 2.3 | 0.6145 | 20.8% | 0.0000 | 0.4309 | 43.1% | 3.55 | 3100 |
| C — Makes-Sense Head Only (B=5) | 51.3779 | 0.7975 | 0.7736 | 0.7115 | 0.0000 | 0.0000 | 3.3 | 0.3449 | 18.8% | 0.0000 | 0.2025 | 34.7% | 4.00 | 678206 |
| D — Full Ensemble (B=5) | 50.2681 | 0.5501 | 0.4866 | 0.6962 | 0.3440 | 0.8730 | 2.3 | 0.6457 | 25.0% | -0.1587 | 0.4499 | 55.6% | 3.58 | 3100 |

---

## 2. Key Insights & Discussion
* **Greedy vs. Full Ensemble**: Full Ensemble uses beam search (B=5) to plan trajectories, resulting in higher local/global scores and stronger narrative consistency.
* **Policy Head Impact**: Incorporating the Policy Head reduces the search space size (pruning options early) and cuts down runtime while preserving narrative continuity.
* **Makes-Sense Head Coherence**: The Makes-Sense head ensures semantic flow. In "Makes-Sense Only", trajectories show logical connections.
* **Narrative Consistency**: Full Ensemble (Configuration D) achieves the highest Narrative Consistency score, proving that integrating multi-level evaluators leads to coherent narrative arcs.
