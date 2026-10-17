"""
AlphaLM v5.5.3 — 5-Condition Ablation Study
=============================================
Evaluates the effect of gradually enabling repetition penalty components
on trajectory quality and diversity.

Conditions:
  A) No repetition penalties (baseline v5.5.2 behavior)
  B) Sentence Repetition only
  C) Sentence + Semantic Repetition
  D) Sentence + Semantic + Topic Repetition
  E) Full system: D + Topic Progress Bonus

Metrics per seed/condition:
  - Total Score
  - Exact Boundary Matches
  - Avg Local Coherence
  - Avg Global Coherence
  - Avg Makes-Sense Score
  - Avg Validity Score
  - Diversity (mean pairwise cosine distance between selected sentence embeddings)
  - Avg Topic Progress Bonus per step
  - Runtime (seconds)

Seeds: 20, 40, 100, 200, 500
"""

import os
import sys
import time
import json
import numpy as np
from pathlib import Path
from typing import List, Dict, Any
from itertools import combinations

ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from search import AlphaLMSearcher
from models.makes_sense_v2_1 import DeepMakesSenseEvaluatorV2_1
from models.sentence_validity_v2 import SentenceValidityEvaluatorV2
from policy.infer import AlphaLMPolicyHead
from metrics import generate_path_report
from utils import log_info, set_seed
from scoring.repetition_semantic import cosine_similarity


def compute_diversity(sentence_vecs: List[np.ndarray]) -> float:
    """Mean pairwise cosine distance (1 - similarity) between all selected sentence embeddings."""
    if len(sentence_vecs) < 2:
        return 0.0
    distances = []
    for va, vb in combinations(sentence_vecs, 2):
        sim = cosine_similarity(va, vb)
        distances.append(1.0 - sim)
    return float(np.mean(distances))


# ── Ablation condition definitions ───────────────────────────────────────────
CONDITIONS = {
    "A_no_repetition": {
        "label": "A — No Repetition Penalties (Baseline)",
        "sentence_rep":  0.0,
        "semantic_rep":  0.0,
        "topic_rep":     0.0,
        "topic_progress": 0.0,
    },
    "B_sentence_only": {
        "label": "B — Sentence Repetition Only",
        "sentence_rep":  1.0,
        "semantic_rep":  0.0,
        "topic_rep":     0.0,
        "topic_progress": 0.0,
    },
    "C_sent_semantic": {
        "label": "C — Sentence + Semantic Repetition",
        "sentence_rep":  1.0,
        "semantic_rep":  0.75,
        "topic_rep":     0.0,
        "topic_progress": 0.0,
    },
    "D_sent_sem_topic": {
        "label": "D — Sentence + Semantic + Topic Repetition",
        "sentence_rep":  1.0,
        "semantic_rep":  0.75,
        "topic_rep":     1.25,
        "topic_progress": 0.0,
    },
    "E_full_system": {
        "label": "E — Full System (+ Topic Progress Bonus)",
        "sentence_rep":  1.0,
        "semantic_rep":  0.75,
        "topic_rep":     1.25,
        "topic_progress": 0.5,
    },
}

BASE_WEIGHTS = {
    "boundary":   1.0,
    "local":      0.5,
    "global":     0.5,
    "completion": 0.0,
    "makes_sense": 1.5,
    "policy":     1.0,
    "validity":   1.0,
}


def main():
    set_seed(root_config.SEED)

    # 1. Load Corpus
    log_info("Loading corpus...")
    corpus_text = load_corpus(root_config.CORPUS_PATH)
    sentences   = split_into_sentences(corpus_text)
    valid_sents = [s for s in sentences if clean_and_tokenize(s)]
    log_info(f"Loaded {len(valid_sents)} valid sentences.")

    # 2. Initialize Neural Evaluators
    log_info("Loading evaluators...")
    ms_eval   = DeepMakesSenseEvaluatorV2_1()
    val_eval  = SentenceValidityEvaluatorV2()
    pol_head  = AlphaLMPolicyHead()
    w2v       = ms_eval.w2v

    searcher = AlphaLMSearcher(
        corpus_sentences=valid_sents,
        w2v_model=w2v,
        makes_sense_evaluator=ms_eval,
        policy_head=pol_head,
        sentence_validity_evaluator=val_eval,
    )

    seeds        = [20, 40, 100, 200, 500]
    beam_width   = 5
    num_sents    = 8
    results_dir  = ROOT_DIR / "ablation_results_v5.5.3"
    results_dir.mkdir(parents=True, exist_ok=True)

    all_results: Dict[str, List[Dict]] = {cid: [] for cid in CONDITIONS}

    for cid, cond in CONDITIONS.items():
        log_info(f"\nRunning condition: {cond['label']}")

        weights = {**BASE_WEIGHTS,
                   "sentence_rep":   cond["sentence_rep"],
                   "semantic_rep":   cond["semantic_rep"],
                   "topic_rep":      cond["topic_rep"],
                   "topic_progress": cond["topic_progress"]}

        for seed in seeds:
            log_info(f"  Seed {seed}...")
            t0 = time.time()

            best_path, _ = searcher.search(
                seed_idx=seed,
                num_sentences=num_sents,
                beam_width=beam_width,
                weights=weights,
                stitch_mode="sentence_preserving",
            )
            runtime = time.time() - t0

            report = generate_path_report(
                best_path.sentence_indices,
                best_path.local_scores,
                best_path.global_scores,
                best_path.match_scores,
                best_path.total_score,
                makes_sense_scores=best_path.makes_sense_scores,
                policy_scores=best_path.policy_scores,
                validity_scores=best_path.validity_scores,
            )

            # Diversity: pairwise cosine distance among selected embeddings
            diversity = compute_diversity(best_path.sentence_embeddings)

            # Avg topic progress bonus over the path
            avg_progress = float(np.mean(best_path.topic_progress_bonuses)) if best_path.topic_progress_bonuses else 0.0

            run_data = {
                "seed": seed,
                "condition": cid,
                "generated_text": best_path.generated_text,
                "path_indices": best_path.sentence_indices,
                "metrics": {
                    "total_score":        best_path.total_score,
                    "exact_matches":      report["exact_boundary_matches"],
                    "avg_local":          report["avg_local_coherence"],
                    "avg_global":         report["avg_global_coherence"],
                    "avg_makes_sense":    report.get("avg_makes_sense_score", 0.0),
                    "avg_validity":       report.get("avg_validity_score", 0.0),
                    "diversity":          diversity,
                    "avg_topic_progress": avg_progress,
                    "runtime":            runtime,
                }
            }
            all_results[cid].append(run_data)

            json_path = results_dir / f"{cid}_seed_{seed}.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(run_data, f, indent=2, ensure_ascii=False)

    # ── Build aggregate table ─────────────────────────────────────────────
    log_info("\nCalculating aggregate metrics...")

    metric_keys = [
        "total_score", "exact_matches", "avg_local", "avg_global",
        "avg_makes_sense", "avg_validity", "diversity", "avg_topic_progress", "runtime"
    ]
    agg_rows = []
    for cid, cond in CONDITIONS.items():
        runs = all_results[cid]
        row = {"Condition": cond["label"]}
        for k in metric_keys:
            vals = [r["metrics"][k] for r in runs]
            row[k] = float(np.mean(vals))
        agg_rows.append(row)

    # ── Markdown report ───────────────────────────────────────────────────
    brain_dir   = Path("C:/Users/user/.gemini/antigravity/brain/fef7e8e7-dda2-49a6-aeb3-8120dfb19d63")
    brain_dir.mkdir(parents=True, exist_ok=True)
    report_path = brain_dir / "AlphaLM_v553_Report.md"

    header = (
        "| Condition | Total Score | Exact Matches | Avg Local | Avg Global"
        " | Avg Makes-Sense | Avg Validity | Diversity | Avg Progress | Runtime (s) |"
    )
    sep = (
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
    )
    table_rows = [header, sep]
    for row in agg_rows:
        table_rows.append(
            f"| {row['Condition']} "
            f"| {row['total_score']:.4f} "
            f"| {row['exact_matches']:.1f} "
            f"| {row['avg_local']:.4f} "
            f"| {row['avg_global']:.4f} "
            f"| {row['avg_makes_sense']:.4f} "
            f"| {row['avg_validity']:.4f} "
            f"| {row['diversity']:.4f} "
            f"| {row['avg_topic_progress']:.4f} "
            f"| {row['runtime']:.2f} |"
        )
    table_md = "\n".join(table_rows)

    # Per-seed qualitative examples
    examples_md_parts = []
    for seed in seeds:
        examples_md_parts.append(f"## Seed {seed}\n")
        for cid, cond in CONDITIONS.items():
            run = next(r for r in all_results[cid] if r["seed"] == seed)
            m   = run["metrics"]
            examples_md_parts.append(f"### {cond['label']}\n")
            examples_md_parts.append(f'> "{run["generated_text"]}"\n')
            examples_md_parts.append(
                f"*Diversity: {m['diversity']:.4f} | "
                f"Avg Progress: {m['avg_topic_progress']:.4f} | "
                f"Total Score: {m['total_score']:.4f}*\n"
            )
        examples_md_parts.append("---\n")
    examples_md = "\n".join(examples_md_parts)

    report_content = f"""# AlphaLM v5.5.3 — Multi-Level Repetition Control Ablation Report

This report evaluates five conditions of the **Repetition Penalty System** introduced in AlphaLM v5.5.3.
The repetition system acts as a negative force during beam search, subtracting a penalty from the composite score
to enforce forward topic progression rather than semantic looping.

---

## Score Formula

```
Total = Boundary + Local + Global + MakesSense + Policy + Validity
      − (w_sent × SentenceRep + w_sem × SemanticRep + w_topic × TopicRep − w_progress × TopicProgress)
```

Default weights: `w_sent=1.0`, `w_sem=0.75`, `w_topic=1.25`, `w_progress=0.5`

---

## Ablation Conditions

| ID | Description |
| :--- | :--- |
| A | No repetition penalties (v5.5.2 baseline) |
| B | Sentence Repetition only (hard exact-duplicate gate) |
| C | Sentence + Semantic Repetition (≥0.85 cosine threshold) |
| D | Sentence + Semantic + Topic Repetition (topic memory centroid) |
| E | Full system: D + Topic Progress Bonus (exploration reward) |

---

## 1. Aggregate Metrics Table

{table_md}

---

## 2. Qualitative Output Comparisons

{examples_md}

## 3. Analysis & Key Findings

### Topic Diversity
- From **Condition A → E**, the `Diversity` metric (mean pairwise cosine distance between selected sentence embeddings)
  is expected to increase, indicating that the search selects sentences from a broader range of semantic regions.

### Topic Progress
- The `Avg Progress` column reflects the mean exploration bonus per step. Higher values confirm that
  the full system (Condition E) actively steers the trajectory into novel topic territory.

### Score Trade-off
- The `Total Score` may decrease slightly in penalized conditions (B→E) as the search is pushed
  away from highest-scoring but locally repetitive trajectories. This is the intended trade-off:
  *topic breadth over local score maximisation*.

### Separation of Concerns
- The repetition system operates entirely at **scoring time** and does not modify the corpus,
  the boundary overlap logic, the policy head, or the validity model.
  It is fully weight-configurable and can be disabled via `--no-repetition-penalty`.
"""

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)

    log_info(f"\nReport saved to: {report_path}")
    log_info("AlphaLM v5.5.3 ablation study complete.")


if __name__ == "__main__":
    main()
