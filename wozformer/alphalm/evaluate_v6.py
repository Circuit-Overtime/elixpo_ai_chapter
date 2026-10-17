import os
import sys
import time
import json
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
from policy.infer import AlphaLMPolicyHead
from metrics import generate_path_report
from utils import log_info, set_seed
from similarity import cosine_similarity

# Import the four evaluators
from models.makes_sense_v2_1 import DeepMakesSenseEvaluatorV2_1
from models.makes_sense_transformer import DeepMakesSenseEvaluatorTransformer
from models.sentence_validity_v2 import SentenceValidityEvaluatorV2
from models.sentence_validity_transformer import SentenceValidityEvaluatorTransformer

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

def count_evaluations(corpus_size: int, beam_width: int, num_sentences: int, use_policy: bool) -> int:
    total = 0
    total += 100 if use_policy else (corpus_size - 1)
    for step in range(2, num_sentences):
        total += beam_width * (100 if use_policy else (corpus_size - step))
    return total

# ── Narrative Consistency Scorer ───────────────────────────────────────────

class NarrativeConsistencyScorer:
    def __init__(self, corpus_path: Path):
        self.sentence_map = defaultdict(list)
        corpus_text = load_corpus(corpus_path)
        stories = corpus_text.split("<|endoftext|>")
        
        log_info("Mapping story sentence relative positions for narrative consistency metric...")
        for story_id, story_raw in enumerate(stories):
            story_raw = story_raw.strip()
            if not story_raw:
                continue
            sents = split_into_sentences(story_raw)
            sents = [s for s in sents if clean_and_tokenize(s)]
            num_sents = len(sents)
            for s_idx, sent in enumerate(sents):
                rel_pos = s_idx / num_sents if num_sents > 0 else 0.5
                self.sentence_map[sent].append((story_id, rel_pos))
                
    def score_path(self, sentences: List[str]) -> float:
        if not sentences:
            return 0.0
            
        story_counts = defaultdict(int)
        for sent in sentences:
            if sent in self.sentence_map:
                for story_id, _ in self.sentence_map[sent]:
                    story_counts[story_id] += 1
                    
        primary_story = max(story_counts, key=story_counts.get) if story_counts else -1
        
        rel_positions = []
        for sent in sentences:
            if sent in self.sentence_map:
                match = next((p for sid, p in self.sentence_map[sent] if sid == primary_story), None)
                if match is not None:
                    rel_positions.append(match)
                else:
                    rel_positions.append(np.mean([p for _, p in self.sentence_map[sent]]))
            else:
                rel_positions.append(0.5)
                
        n = len(sentences)
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
    
    corpus_path = ROOT_DIR / "tinystories_1m.txt"
    if not corpus_path.exists():
        log_info("Error: tinystories_1m.txt not found. Please run extract_tinystories.py first.")
        sys.exit(1)
        
    log_info("Loading corpus sentences...")
    corpus_text = load_corpus(corpus_path)
    stories = corpus_text.split("<|endoftext|>")
    sentences = []
    for story in stories:
        if story.strip():
            sentences.extend(split_into_sentences(story))
    valid_sents = [s for s in sentences if clean_and_tokenize(s)]
    corpus_size = len(valid_sents)
    log_info(f"Loaded {corpus_size} valid sentences.")
    
    # Paths for checkpoints
    w2v_path = ROOT_DIR / "models" / "tinystories_word2vec.model"
    ms_path_v5 = ROOT_DIR / "models" / "makes_sense_tinystories.pt"
    val_path_v5 = ROOT_DIR / "models" / "validity_tinystories.pt"
    
    ms_path_v6 = ROOT_DIR / "models" / "makes_sense_tinystories_transformer.pt"
    val_path_v6 = ROOT_DIR / "models" / "validity_tinystories_transformer.pt"
    
    pol_path = ROOT_DIR / "models" / "policy_tinystories.pt"
    
    log_info("Loading Word2Vec and Policy Head...")
    w2v = Word2Vec.load(str(w2v_path))
    pol_head = AlphaLMPolicyHead(model_path=pol_path, w2v_path=w2v_path, hidden_layers=[256, 64])
    
    log_info("Initializing all 4 evaluators for the ablation study...")
    ms_eval_v5 = DeepMakesSenseEvaluatorV2_1(model_path=ms_path_v5, w2v_path=w2v_path)
    val_eval_v5 = SentenceValidityEvaluatorV2(model_path=val_path_v5, w2v_path=w2v_path, corpus_path=corpus_path)
    
    ms_eval_v6 = DeepMakesSenseEvaluatorTransformer(model_path=ms_path_v6, w2v_path=w2v_path)
    val_eval_v6 = SentenceValidityEvaluatorTransformer(model_path=val_path_v6, w2v_path=w2v_path, corpus_path=corpus_path)
    
    narrative_scorer = NarrativeConsistencyScorer(corpus_path)
    
    seeds = [0, 20, 40, 100, 200, 500]
    num_sents = 8
    beam_width = 5
    
    # 1. Configs definition
    configs = {
        "1_bigru_baseline": {
            "name": "1. BiGRU Makes-Sense + BiGRU Validity (Baseline)",
            "ms": ms_eval_v5,
            "val": val_eval_v5
        },
        "2_makes_sense_transformer": {
            "name": "2. Transformer Makes-Sense + BiGRU Validity",
            "ms": ms_eval_v6,
            "val": val_eval_v5
        },
        "3_validity_transformer": {
            "name": "3. BiGRU Makes-Sense + Transformer Validity",
            "ms": ms_eval_v5,
            "val": val_eval_v6
        },
        "4_transformer_upgrade": {
            "name": "4. Transformer Makes-Sense + Transformer Validity (V6 Upgrade)",
            "ms": ms_eval_v6,
            "val": val_eval_v6
        }
    }
    
    # Composite scoring weights (tuned as per config.py)
    weights = {
        "boundary":       root_config.WEIGHT_BOUNDARY,
        "local":          root_config.WEIGHT_LOCAL,
        "global":         root_config.WEIGHT_GLOBAL,
        "completion":     root_config.WEIGHT_COMPLETION,
        "makes_sense":    root_config.WEIGHT_MAKES_SENSE,
        "policy":         root_config.WEIGHT_POLICY,
        "validity":       root_config.WEIGHT_VALIDITY,
        "sentence_rep":   root_config.WEIGHT_SENTENCE_REP,
        "semantic_rep":   root_config.WEIGHT_SEMANTIC_REP,
        "topic_rep":      root_config.WEIGHT_TOPIC_REP,
        "topic_progress": root_config.WEIGHT_TOPIC_PROGRESS,
    }
    
    ablation_results = {}
    
    for cid, conf in configs.items():
        log_info(f"\n--- Running Configuration: {conf['name']} ---")
        
        # Instantiate searcher with current evaluator pairing
        searcher = AlphaLMSearcher(
            corpus_sentences=valid_sents,
            w2v_model=w2v,
            makes_sense_evaluator=conf["ms"],
            policy_head=pol_head,
            sentence_validity_evaluator=conf["val"]
        )
        
        runs = []
        for seed in seeds:
            t0 = time.time()
            best_path, _ = searcher.search(
                seed_idx=seed,
                num_sentences=num_sents,
                beam_width=beam_width,
                weights=weights,
                stitch_mode="smart" # Use smart mode to test stitching validity gate
            )
            elapsed = time.time() - t0
            
            path_sents = [searcher.sentences[idx] for idx in best_path.sentence_indices]
            path_words = [searcher.tokenized_sentences[idx] for idx in best_path.sentence_indices]
            
            # Compute metrics
            rep_rate = compute_sentence_repetition_rate(path_words)
            fwd_progress = compute_forward_progress(w2v, path_words)
            diversity = compute_diversity(best_path.sentence_embeddings)
            narrative = narrative_scorer.score_path(path_sents)
            
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
                "narrative": narrative,
                "runtime": elapsed
            })
            log_info(f"  Seed {seed:03d} -> Score: {best_path.total_score:.2f} | MS: {avg_makes_sense:.3f} | Val: {avg_validity:.3f} | Rep: {rep_rate*100:.1f}% | Narrative: {narrative:.3f}")
            
        # Average metrics
        avg_score = float(np.mean([r["total_score"] for r in runs]))
        avg_ms = float(np.mean([r["makes_sense"] for r in runs]))
        avg_val = float(np.mean([r["validity"] for r in runs]))
        avg_rep = float(np.mean([r["repetition"] for r in runs]))
        avg_div = float(np.mean([r["diversity"] for r in runs]))
        avg_prog = float(np.mean([r["progress"] for r in runs]))
        avg_narr = float(np.mean([r["narrative"] for r in runs]))
        avg_time = float(np.mean([r["runtime"] for r in runs]))
        
        ablation_results[cid] = {
            "name": conf["name"],
            "avg_score": avg_score,
            "avg_ms": avg_ms,
            "avg_val": avg_val,
            "avg_repetition": avg_rep,
            "avg_diversity": avg_div,
            "avg_progress": avg_prog,
            "avg_narrative": avg_narr,
            "avg_runtime": avg_time,
            "runs": runs
        }
        
    # Print Markdown Summary Table
    print("\n\n=============================================================")
    print("                     ALPHA-LM V6 ABLATION SUMMARY")
    print("=============================================================")
    print("| Configuration | Score | Makes-Sense | Validity | Rep Rate | Diversity | Progress | Narrative | Runtime (s) |")
    print("|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|")
    for cid, res in ablation_results.items():
        print(f"| {res['name'][:35]}... | {res['avg_score']:.2f} | {res['avg_ms']:.3f} | {res['avg_val']:.3f} | {res['avg_repetition']*100:.1f}% | {res['avg_diversity']:.3f} | {res['avg_progress']:.3f} | {res['avg_narrative']:.3f} | {res['avg_runtime']:.3f} |")
        
    # Generate report file in reports/
    reports_dir = ROOT_DIR / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_file = reports_dir / "alphaLM_v6_transformer_report.md"
    
    with open(report_file, "w", encoding="utf-8") as f:
        f.write("# AlphaLM v6 Ablation & Evaluation Report\n\n")
        f.write("> *Evaluating the impact of replacing BiGRU evaluators with Tiny Transformers.*\n\n")
        
        f.write("## Architectural Specifications\n")
        f.write("- **MakesSenseTransformer**: Positional Embeddings + 2x Transformer Encoder Layer (h=128, nhead=4, d_ff=256) -> Mean/Max Concatenation -> MLP Classifier (Total params: ~280k)\n")
        f.write("- **SentenceValidityTransformer**: Positional Embeddings + 2x Transformer Encoder Layer (h=128, nhead=4, d_ff=256) -> Max Pooling -> Late concatenation of 7 scalar features -> MLP Classifier (Total params: ~735k)\n\n")
        
        f.write("## Ablation Metrics Table\n\n")
        f.write("| Configuration | Total Score | Makes-Sense | Validity | Repetition Rate | Diversity | Forward Progress | Narrative Consistency | Runtime (s) |\n")
        f.write("|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n")
        for cid, res in ablation_results.items():
            f.write(f"| {res['name']} | {res['avg_score']:.2f} | {res['avg_ms']:.3f} | {res['avg_val']:.3f} | {res['avg_repetition']*100:.1f}% | {res['avg_diversity']:.3f} | {res['avg_progress']:.3f} | {res['avg_narrative']:.3f} | {res['avg_runtime']:.3f} |\n")
            
        f.write("\n## Qualitative Generation Samples\n\n")
        for seed in seeds:
            f.write(f"### Seed {seed}\n")
            for cid, res in ablation_results.items():
                run_info = next(r for r in res["runs"] if r["seed"] == seed)
                f.write(f"**{res['name']}**:\n")
                f.write(f"> {run_info['text']}\n\n")
                
    log_info(f"\nSaved v6 ablation evaluation report to: {report_file}")

if __name__ == "__main__":
    main()
