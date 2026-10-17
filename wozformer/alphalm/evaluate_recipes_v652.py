import os
import sys
import time
import json
import tracemalloc
import numpy as np
from pathlib import Path
from typing import List, Dict, Any
from collections import defaultdict
from itertools import combinations
from gensim.models import Word2Vec

# Add parent directory to path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

import config as root_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from search import AlphaLMSearcher
from similarity import cosine_similarity
from utils import log_info, set_seed

from models.makes_sense_transformer import DeepMakesSenseEvaluatorTransformerV652
from models.sentence_validity_v2 import SentenceValidityEvaluatorV2
from policy.infer import AlphaLMPolicyHeadV652

# ── Redundancy and Diversity Metrics ───────────────────────────────────────

def compute_sentence_repetition_rate(sentences_words: List[List[str]]) -> float:
    n = len(sentences_words)
    if n <= 1:
        return 0.0
    repeated_count = 0
    for i in range(n):
        is_repeated = False
        for j in range(n):
            if i == j:
                continue
            words_i = set(sentences_words[i])
            words_j = set(sentences_words[j])
            if not words_i or not words_j:
                continue
            jaccard = len(words_i.intersection(words_j)) / len(words_i.union(words_j))
            if jaccard > 0.5:
                is_repeated = True
                break
        if is_repeated:
            repeated_count += 1
    return float(repeated_count / n)

def compute_forward_progress(w2v: Word2Vec, sentences_words: List[List[str]]) -> float:
    n = len(sentences_words)
    if n <= 1:
        return 0.0
    distances = []
    for i in range(n - 1):
        vec_i = get_mean_vector(w2v, sentences_words[i])
        vec_next = get_mean_vector(w2v, sentences_words[i + 1])
        sim = cosine_similarity(vec_i, vec_next)
        distances.append(1.0 - sim)
    return float(np.mean(distances))

def get_mean_vector(w2v, words):
    vectors = [w2v.wv[w] for w in words if w in w2v.wv]
    if not vectors:
        return np.zeros(w2v.vector_size, dtype=np.float32)
    return np.mean(vectors, axis=0)

def compute_diversity(sentence_vecs: List[np.ndarray]) -> float:
    if len(sentence_vecs) < 2:
        return 0.0
    distances = []
    for va, vb in combinations(sentence_vecs, 2):
        sim = cosine_similarity(va, vb)
        distances.append(1.0 - sim)
    return float(np.mean(distances))

# ── Procedural Consistency Scorer ───────────────────────────────────────────

class ProceduralConsistencyScorer:
    def __init__(self, corpus_path: Path):
        self.sentence_map = defaultdict(list)
        corpus_text = load_corpus(corpus_path)
        recipes = corpus_text.split("<|endoftext|>")
        
        log_info("Mapping recipe sentence relative positions for procedural consistency metric...")
        for recipe_id, recipe_raw in enumerate(recipes):
            recipe_raw = recipe_raw.strip()
            if not recipe_raw:
                continue
            sents = split_into_sentences(recipe_raw)
            sents = [s for s in sents if clean_and_tokenize(s)]
            num_sents = len(sents)
            for s_idx, sent in enumerate(sents):
                rel_pos = s_idx / num_sents if num_sents > 0 else 0.5
                self.sentence_map[sent].append((recipe_id, rel_pos))
                
    def score_path(self, sentences: List[str]) -> float:
        if not sentences:
            return 0.0
            
        recipe_counts = defaultdict(int)
        for sent in sentences:
            if sent in self.sentence_map:
                for recipe_id, _ in self.sentence_map[sent]:
                    recipe_counts[recipe_id] += 1
                    
        primary_recipe = max(recipe_counts, key=recipe_counts.get) if recipe_counts else -1
        
        rel_positions = []
        for sent in sentences:
            if sent in self.sentence_map:
                match = next((p for rid, p in self.sentence_map[sent] if rid == primary_recipe), None)
                if match is not None:
                    rel_positions.append(match)
                else:
                    rel_positions.append(np.mean([p for _, p in self.sentence_map[sent]]))
            else:
                rel_positions.append(0.5)
                
        beg_correct = 0
        beg_total = 2
        dev_correct = 0
        dev_total = 4
        res_correct = 0
        res_total = 2
        
        for val in rel_positions[:2]:
            if val <= 0.35:
                beg_correct += 1
                
        for val in rel_positions[2:6]:
            if 0.20 <= val <= 0.80:
                dev_correct += 1
                
        for val in rel_positions[6:]:
            if val >= 0.65:
                res_correct += 1
                
        beg_score = beg_correct / beg_total
        dev_score = dev_correct / dev_total
        res_score = res_correct / res_total
        
        return float((beg_score + dev_score + res_score) / 3.0)

# ── Main Study ─────────────────────────────────────────────────────────────

def main():
    set_seed(root_config.SEED)
    tracemalloc.start()
    
    corpus_path = ROOT_DIR / "recipes_5m.txt"
    if not corpus_path.exists():
        log_info("Error: recipes_5m.txt not found. Please run extract_recipes.py first.")
        sys.exit(1)
        
    log_info("Loading corpus sentences...")
    corpus_text = load_corpus(corpus_path)
    recipes = corpus_text.split("<|endoftext|>")
    sentences = []
    for r in recipes:
        if r.strip():
            sentences.extend(split_into_sentences(r))
    import re
    any_word_char = re.compile(r'\w')
    valid_sents = [s for s in sentences if any_word_char.search(s)]
    corpus_size = len(valid_sents)
    log_info(f"Loaded {corpus_size} valid sentences.")
    
    # Paths for recipe checkpoints
    w2v_path = ROOT_DIR / "models" / "recipes_word2vec.model"
    ms_path = ROOT_DIR / "models" / "makes_sense_recipes_transformer_v652.pt"
    val_path = ROOT_DIR / "models" / "validity_recipes_bigru.pt"
    pol_path = ROOT_DIR / "models" / "policy_recipes_v652.pt"
    
    log_info("Loading Word2Vec...")
    w2v = Word2Vec.load(str(w2v_path))
    
    log_info("Initializing v6.5.2 Policy Head (Token-Level)...")
    pol_head = AlphaLMPolicyHeadV652(model_path=pol_path, w2v_path=w2v_path, hidden_layers=[512, 256, 64])
    
    log_info("Initializing v6.5.2 Makes-Sense Evaluator (Token-Level)...")
    ms_eval = DeepMakesSenseEvaluatorTransformerV652(model_path=ms_path, w2v_path=w2v_path)
    
    # Pre-compute learned sentence embeddings for all corpus sentences (batched GPU pass)
    log_info("Pre-computing token-level sentence embeddings for Makes-Sense evaluator...")
    ms_eval.precompute_embeddings(valid_sents)
    
    log_info("Pre-computing token-level sentence embeddings for Policy Head...")
    pol_head.precompute_embeddings(valid_sents)
    
    # Report parameter counts
    ms_params = sum(p.numel() for p in ms_eval.full_model.parameters())
    pol_params = sum(p.numel() for p in pol_head.full_model.parameters())
    log_info(f"Parameter Counts — Makes-Sense: {ms_params:,} | Policy: {pol_params:,} | Combined: {ms_params + pol_params:,}")
    
    log_info("Initializing searcher...")
    searcher = AlphaLMSearcher(
        corpus_sentences=valid_sents,
        w2v_model=w2v,
        makes_sense_evaluator=ms_eval,
        policy_head=pol_head,
        sentence_validity_evaluator=None
    )
    
    log_info("Initializing Sentence Validity Evaluator (BiGRU — unchanged from v6.5.1)...")
    val_eval = SentenceValidityEvaluatorV2(model_path=val_path, w2v_path=w2v_path, corpus_path=valid_sents)
    searcher.sentence_validity_evaluator = val_eval
    
    # Pre-populate validity scores cache
    log_info("Pre-populating sentence validity evaluator cache...")
    scores = val_eval.score_sentences(searcher.sentences)
    searcher.validity_scores_cache = {idx: score for idx, score in enumerate(scores)}
    
    # Consistency scorer
    consistency_scorer = ProceduralConsistencyScorer(corpus_path)
    
    # Memory snapshot
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    log_info(f"Memory — Current: {current_mem / 1e6:.1f} MB | Peak: {peak_mem / 1e6:.1f} MB")
    
    seeds = [0, 20, 40, 100, 200, 500]
    num_sents = 8
    
    # Define weight configurations (same as v6.5.1)
    configs = {
        "A_greedy": {
            "name": "Configuration A (Greedy B=1)",
            "beam_width": 1,
            "weights": {
                "boundary": 1.0,
                "local": 3.0,
                "global": 3.0,
                "completion": 0.0,
                "makes_sense": 3.0,
                "policy": 1.0,
                "validity": 1.5,
                "sentence_rep": 1.0,
                "semantic_rep": 0.25,
                "topic_rep": 2.25,
                "topic_progress": 0.5,
            }
        },
        "B_policy_only": {
            "name": "Configuration B (Policy Only B=5)",
            "beam_width": 5,
            "weights": {
                "boundary": 1.0,
                "local": 3.0,
                "global": 3.0,
                "completion": 0.0,
                "makes_sense": 0.0,
                "policy": 1.0,
                "validity": 0.0,
                "sentence_rep": 1.0,
                "semantic_rep": 0.25,
                "topic_rep": 2.25,
                "topic_progress": 0.5,
            }
        },
        "C_makes_sense_only": {
            "name": "Configuration C (Token-Level Makes-Sense Only B=5)",
            "beam_width": 5,
            "weights": {
                "boundary": 1.0,
                "local": 3.0,
                "global": 3.0,
                "completion": 0.0,
                "makes_sense": 3.0,
                "policy": 0.0,
                "validity": 0.0,
                "sentence_rep": 1.0,
                "semantic_rep": 0.25,
                "topic_rep": 2.25,
                "topic_progress": 0.5,
            }
        },
        "D_full_ensemble": {
            "name": "Configuration D (Full Ensemble B=5)",
            "beam_width": 5,
            "weights": {
                "boundary": 1.0,
                "local": 3.0,
                "global": 3.0,
                "completion": 0.0,
                "makes_sense": 3.0,
                "policy": 1.0,
                "validity": 1.5,
                "sentence_rep": 1.0,
                "semantic_rep": 0.25,
                "topic_rep": 2.25,
                "topic_progress": 0.5,
            }
        }
    }
    
    ablation_results = {}
    
    for cid, conf in configs.items():
        log_info(f"\n--- Running Configuration: {conf['name']} ---")
        
        # Configure searcher active evaluators dynamically
        searcher.makes_sense_evaluator = ms_eval if conf["weights"]["makes_sense"] > 0.0 else None
        searcher.policy_head = pol_head if conf["weights"]["policy"] > 0.0 else None
        searcher.sentence_validity_evaluator = val_eval if conf["weights"]["validity"] > 0.0 else None
        
        runs = []
        for seed in seeds:
            t0 = time.time()
            best_path, _ = searcher.search(
                seed_idx=seed,
                num_sentences=num_sents,
                beam_width=conf["beam_width"],
                weights=conf["weights"],
                stitch_mode="smart"
            )
            elapsed = time.time() - t0
            
            path_sents = [searcher.sentences[idx] for idx in best_path.sentence_indices]
            path_words = [searcher.tokenized_sentences[idx] for idx in best_path.sentence_indices]
            
            # Compute metrics
            rep_rate = compute_sentence_repetition_rate(path_words)
            fwd_progress = compute_forward_progress(w2v, path_words)
            diversity = compute_diversity(best_path.sentence_embeddings)
            consistency = consistency_scorer.score_path(path_sents)
            
            avg_makes_sense = float(np.mean(best_path.makes_sense_scores)) if best_path.makes_sense_scores else 0.0
            avg_validity = float(np.mean(best_path.validity_scores)) if best_path.validity_scores else 0.0
            
            runs.append({
                "seed": seed,
                "text": best_path.generated_text,
                "total_score": best_path.total_score,
                "makes_sense": avg_makes_sense,
                "validity": avg_validity,
                "repetition": rep_rate,
                "diversity": diversity,
                "progress": fwd_progress,
                "consistency": consistency,
                "runtime": elapsed
            })
            log_info(f"  Seed {seed:03d} -> Score: {best_path.total_score:.2f} | MS: {avg_makes_sense:.3f} | Val: {avg_validity:.3f} | Rep: {rep_rate*100:.1f}% | Consistency: {consistency*100:.1f}%")
            
        # Average metrics
        avg_score = float(np.mean([r["total_score"] for r in runs]))
        avg_ms = float(np.mean([r["makes_sense"] for r in runs]))
        avg_val = float(np.mean([r["validity"] for r in runs]))
        avg_rep = float(np.mean([r["repetition"] for r in runs]))
        avg_div = float(np.mean([r["diversity"] for r in runs]))
        avg_prog = float(np.mean([r["progress"] for r in runs]))
        avg_const = float(np.mean([r["consistency"] for r in runs]))
        avg_time = float(np.mean([r["runtime"] for r in runs]))
        
        ablation_results[cid] = {
            "name": conf["name"],
            "avg_score": avg_score,
            "avg_ms": avg_ms,
            "avg_val": avg_val,
            "avg_repetition": avg_rep,
            "avg_diversity": avg_div,
            "avg_progress": avg_prog,
            "avg_consistency": avg_const,
            "avg_runtime": avg_time,
            "runs": runs
        }
        
    # Memory final
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    # Print Markdown Summary Table
    print("\n\n=============================================================")
    print("                     ALPHA-LM V6.5.2 TOKEN-LEVEL JUDGE ABLATION SUMMARY")
    print("=============================================================")
    print("| Configuration | Score | Makes-Sense | Validity | Rep Rate | Diversity | Progress | Consistency | Runtime (s) |")
    print("|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|")
    for cid, res in ablation_results.items():
        print(f"| {res['name'][:45]}... | {res['avg_score']:.2f} | {res['avg_ms']:.3f} | {res['avg_val']:.3f} | {res['avg_repetition']*100:.1f}% | {res['avg_diversity']:.3f} | {res['avg_progress']:.3f} | {res['avg_consistency']*100:.1f}% | {res['avg_runtime']:.3f} |")
        
    print(f"\nParameter Counts — Makes-Sense: {ms_params:,} | Policy: {pol_params:,} | Combined: {ms_params + pol_params:,}")
    print(f"Memory — Peak: {peak_mem / 1e6:.1f} MB")
    
    # Generate reports
    reports_dir = ROOT_DIR / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    samples_file = reports_dir / "recipe_generation_samples_v652.md"
    
    with open(samples_file, "w", encoding="utf-8") as f:
        f.write("# AlphaLM v6.5.2 Qualitative Recipe Generation Samples\n\n")
        for seed in seeds:
            f.write(f"## Seed Index {seed}\n")
            f.write(f"**Seed instruction**: {valid_sents[seed]}\n\n")
            for cid, res in ablation_results.items():
                run_info = next(r for r in res["runs"] if r["seed"] == seed)
                f.write(f"### {res['name']}\n")
                f.write(f"- **Total Score**: `{run_info['total_score']:.2f}`\n")
                f.write(f"- **Makes-Sense**: `{run_info['makes_sense']:.3f}` | **Validity**: `{run_info['validity']:.3f}` | **Consistency**: `{run_info['consistency']*100:.1f}%` | **RepRate**: `{run_info['repetition']*100:.1f}%`\n")
                f.write(f"- **Generated Recipe**:\n")
                f.write(f"```text\n{run_info['text']}\n```\n\n")
                
    log_info(f"Saved qualitative samples to: {samples_file}")
    
    # Save quantitative ablation report
    report_file = reports_dir / "alphaLM_v6_5_2_recipe_report.md"
    with open(report_file, "w", encoding="utf-8") as f:
        f.write("# AlphaLM v6.5.2 — Token-Level Judge Upgrade Report\n\n")
        
        f.write("## Parameter Counts\n\n")
        f.write("| Component | Parameters |\n")
        f.write("|:---|---:|\n")
        f.write(f"| Makes-Sense Evaluator (Token-Level) | {ms_params:,} |\n")
        f.write(f"| Policy Head (Token-Level) | {pol_params:,} |\n")
        f.write(f"| Sentence Validity (BiGRU, unchanged) | — |\n")
        f.write(f"| **Combined Token-Level** | **{ms_params + pol_params:,}** |\n\n")
        
        f.write("## Training Metrics\n\n")
        f.write("| Model | Metric | v6.5.1 (Mean W2V) | v6.5.2 (Token-Level) |\n")
        f.write("|:---|:---|:---:|:---:|\n")
        f.write("| Makes-Sense | Pairwise Ranking Acc | 82.19% | 78.48% |\n")
        f.write("| Makes-Sense | ROC AUC | 0.7641 | 0.7756 |\n")
        f.write("| Policy | Accuracy | 97.43% | 94.73% |\n")
        f.write("| Policy | ROC AUC | 0.7814 | 0.7997 |\n")
        f.write("| Policy | F1 | 0.0597 | 0.1887 |\n\n")
        
        f.write("## Ablation Metrics Table\n\n")
        f.write("| Configuration | Total Score | Makes-Sense | Validity | Repetition Rate | Diversity | Forward Progress | Procedural Consistency % | Runtime (s) |\n")
        f.write("|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n")
        for cid, res in ablation_results.items():
            f.write(f"| {res['name']} | {res['avg_score']:.2f} | {res['avg_ms']:.3f} | {res['avg_val']:.3f} | {res['avg_repetition']*100:.1f}% | {res['avg_diversity']:.3f} | {res['avg_progress']:.3f} | {res['avg_consistency']*100:.1f}% | {res['avg_runtime']:.3f} |\n")
            
        f.write(f"\nMemory — Peak: {peak_mem / 1e6:.1f} MB\n\n")
        
        # Comparison with v6.5.1
        f.write("## Comparison with v6.5.1 Baselines\n\n")
        f.write("| Configuration | v6.5.1 Score | v6.5.2 Score | v6.5.1 Consistency | v6.5.2 Consistency | v6.5.1 Rep | v6.5.2 Rep |\n")
        f.write("|:---|:---:|:---:|:---:|:---:|:---:|:---:|\n")
        v651_baselines = {
            "A_greedy": {"score": 52.35, "consistency": 55.6, "rep": 4.2},
            "B_policy_only": {"score": 56.04, "consistency": 54.2, "rep": 16.7},
            "C_makes_sense_only": {"score": 69.09, "consistency": 44.4, "rep": 47.9},
            "D_full_ensemble": {"score": 67.42, "consistency": 52.8, "rep": 0.0}
        }
        for cid, res in ablation_results.items():
            base = v651_baselines.get(cid, {})
            f.write(f"| {res['name']} | {base.get('score', 'N/A')} | {res['avg_score']:.2f} | {base.get('consistency', 'N/A')}% | {res['avg_consistency']*100:.1f}% | {base.get('rep', 'N/A')}% | {res['avg_repetition']*100:.1f}% |\n")
        
        f.write("\n## Research Questions & Answers\n\n")
        f.write("### Q1: Do token-level sentence encodings produce better procedural flow?\n")
        f.write("[To be answered after reviewing results]\n\n")
        f.write("### Q2: Do token-level encodings reduce semantic looping?\n")
        f.write("[To be answered after reviewing results]\n\n")
        f.write("### Q3: Do token-level encodings improve long-range consistency?\n")
        f.write("[To be answered after reviewing results]\n\n")
        f.write("### Q4: Do generations still collapse into topic-neighborhood patterns?\n")
        f.write("[To be answered after reviewing results]\n\n")
        f.write("### Q5: Is sentence representation the primary bottleneck?\n")
        f.write("[To be answered after reviewing results]\n\n")
        
    log_info(f"Saved quantitative report to: {report_file}")

if __name__ == "__main__":
    main()
