# AlphaLM v6.5.2 — Token-Level Judge Upgrade Report

## Parameter Counts

| Component | Parameters |
|:---|---:|
| Makes-Sense Evaluator (Token-Level) | 1,335,489 |
| Policy Head (Token-Level) | 1,671,681 |
| Sentence Validity (BiGRU, unchanged) | — |
| **Combined Token-Level** | **3,007,170** |

## Training Metrics

| Model | Metric | v6.5.1 (Mean W2V) | v6.5.2 (Token-Level) |
|:---|:---|:---:|:---:|
| Makes-Sense | Pairwise Ranking Acc | 82.19% | 78.48% |
| Makes-Sense | ROC AUC | 0.7641 | 0.7756 |
| Policy | Accuracy | 97.43% | 94.73% |
| Policy | ROC AUC | 0.7814 | 0.7997 |
| Policy | F1 | 0.0597 | 0.1887 |

## Ablation Metrics Table

| Configuration | Total Score | Makes-Sense | Validity | Repetition Rate | Diversity | Forward Progress | Procedural Consistency % | Runtime (s) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Configuration A (Greedy B=1) | 59.09 | 0.852 | 0.865 | 14.6% | 0.578 | 0.418 | 56.9% | 16.280 |
| Configuration B (Policy Only B=5) | 38.96 | 0.000 | 0.000 | 68.8% | 0.331 | 0.179 | 56.9% | 48.836 |
| Configuration C (Token-Level Makes-Sense Only B=5) | 79.76 | 0.702 | 0.000 | 35.4% | 0.264 | 0.153 | 41.7% | 43.690 |
| Configuration D (Full Ensemble B=5) | 62.43 | 0.824 | 0.868 | 45.8% | 0.437 | 0.276 | 47.2% | 39.882 |

Memory — Peak: 1236.6 MB

## Comparison with v6.5.1 Baselines

| Configuration | v6.5.1 Score | v6.5.2 Score | v6.5.1 Consistency | v6.5.2 Consistency | v6.5.1 Rep | v6.5.2 Rep |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| Configuration A (Greedy B=1) | 52.35 | 59.09 | 55.6% | 56.9% | 4.2% | 14.6% |
| Configuration B (Policy Only B=5) | 56.04 | 38.96 | 54.2% | 56.9% | 16.7% | 68.8% |
| Configuration C (Token-Level Makes-Sense Only B=5) | 69.09 | 79.76 | 44.4% | 41.7% | 47.9% | 35.4% |
| Configuration D (Full Ensemble B=5) | 67.42 | 62.43 | 52.8% | 47.2% | 0.0% | 45.8% |

## Research Questions & Answers

### Q1: Do token-level sentence encodings produce better procedural flow?
[To be answered after reviewing results]

### Q2: Do token-level encodings reduce semantic looping?
[To be answered after reviewing results]

### Q3: Do token-level encodings improve long-range consistency?
[To be answered after reviewing results]

### Q4: Do generations still collapse into topic-neighborhood patterns?
[To be answered after reviewing results]

### Q5: Is sentence representation the primary bottleneck?
[To be answered after reviewing results]

