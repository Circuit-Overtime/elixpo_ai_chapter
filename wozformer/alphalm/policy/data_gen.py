import sys
import json
import random
from pathlib import Path
from typing import List, Dict, Any
from collections import defaultdict

# Add parent directory to sys.path to allow imports from root folder
POLICY_DIR = Path(__file__).resolve().parent
sys.path.append(str(POLICY_DIR.parent))

import config as root_config
import policy.policy_config as policy_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from search import AlphaLMSearcher, SearchPath
from evaluator.infer import MakesSenseEvaluator
from utils import log_info, set_seed

def generate_policy_data(
    searcher: AlphaLMSearcher,
    seed_idx: int,
    num_sentences: int,
    beam_width: int,
    weights: dict
) -> List[dict]:
    """
    Runs beam search on the corpus, collects transition logs,
    and returns a balanced set of positive and negative transition samples.
    """
    if seed_idx < 0 or seed_idx >= len(searcher.sentences):
        return []
        
    beams = [SearchPath(sentence_indices=[seed_idx], total_score=0.0)]
    collected_samples = []
    
    for step in range(1, num_sentences):
        step_evaluations = []
        
        # Batch evaluation for each path in beam
        for path in beams:
            last_idx = path.sentence_indices[-1]
            makes_sense_cache = {}
            w_makes_sense = weights.get("makes_sense", 0.0)
            
            # Optimize makes-sense scoring using the batch scorer
            if searcher.makes_sense_evaluator is not None and w_makes_sense > 0.0:
                history_sentences = [searcher.sentences[idx] for idx in path.sentence_indices]
                scores = searcher.makes_sense_evaluator.score_candidates(history_sentences, searcher.sentences)
                makes_sense_cache = {idx: score for idx, score in enumerate(scores)}
                
            for cand_idx in range(len(searcher.sentences)):
                if cand_idx == last_idx:
                    continue
                if not root_config.ALLOW_REUSE and cand_idx in path.sentence_indices:
                    continue
                    
                score, details = searcher.evaluate_transition(
                    path.sentence_indices,
                    cand_idx,
                    step,
                    num_sentences,
                    weights,
                    precomputed_makes_sense=makes_sense_cache.get(cand_idx, None)
                )
                step_evaluations.append({
                    "parent_path": path.sentence_indices,
                    "cand_idx": cand_idx,
                    "score": score,
                    "details": details,
                    "path_obj": path
                })
                
        if not step_evaluations:
            break
            
        # Determine survival status
        # Calculate new path scores
        new_paths_scored = []
        for eval_item in step_evaluations:
            new_score = eval_item["path_obj"].total_score + eval_item["score"]
            new_paths_scored.append((new_score, eval_item))
            
        # Sort descending by total score
        new_paths_scored.sort(key=lambda x: x[0], reverse=True)
        
        # Keep only the top beam_width paths
        surviving_items = new_paths_scored[:beam_width]
        surviving_paths = [item[1]["parent_path"] + [item[1]["cand_idx"]] for item in surviving_items]
        surviving_set = set(tuple(p) for p in surviving_paths)
        
        # Group by parent path to construct balanced train samples per decision point
        grouped_evals = defaultdict(list)
        for eval_item in step_evaluations:
            grouped_evals[tuple(eval_item["parent_path"])].append(eval_item)
            
        for parent_tuple, items in grouped_evals.items():
            parent_list = list(parent_tuple)
            positives = []
            negatives = []
            
            for item in items:
                cand_idx = item["cand_idx"]
                full_path = parent_list + [cand_idx]
                is_survived = tuple(full_path) in surviving_set
                
                sample = {
                    "context": [searcher.sentences[idx] for idx in parent_list],
                    "candidate": searcher.sentences[cand_idx],
                    "boundary_score": float(item["details"]["boundary_score"]),
                    "local_coherence": float(item["details"]["local_coherence"]),
                    "global_coherence": float(item["details"]["global_coherence"]),
                    "makes_sense_score": float(item["details"]["makes_sense_score"]),
                    "score": float(item["score"]),
                    "label": 1.0 if is_survived else 0.0
                }
                
                if is_survived:
                    positives.append(sample)
                else:
                    negatives.append(sample)
            
            # Select hard negatives and random negatives
            if negatives:
                negatives.sort(key=lambda x: x["score"], reverse=True)
                top_negatives = negatives[:20]
                random_negatives = random.sample(negatives[20:], min(20, len(negatives) - 20)) if len(negatives) > 20 else []
                selected_negatives = top_negatives + random_negatives
            else:
                selected_negatives = []
                
            collected_samples.extend(positives + selected_negatives)
            
        # Update beams to progress to the next step
        beams = []
        for score, item in surviving_items:
            new_path = item["path_obj"].clone()
            new_path.sentence_indices.append(item["cand_idx"])
            new_path.total_score = score
            new_path.match_scores.append(item["details"]["exact_match"])
            new_path.local_scores.append(item["details"]["local_coherence"])
            new_path.global_scores.append(item["details"]["global_coherence"])
            new_path.makes_sense_scores.append(item["details"]["makes_sense_score"])
            beams.append(new_path)
            
    return collected_samples

def main():
    set_seed(policy_config.SEED)
    
    # 1. Load raw datasets
    log_info("Loading corpus files...")
    sales_text = load_corpus(policy_config.SALES_RAW_PATH)
    newton_text = load_corpus(policy_config.NEWTON_RAW_PATH)
    
    sales_sents = split_into_sentences(sales_text)
    newton_sents = split_into_sentences(newton_text)
    
    # Clean and filter empty sentences
    sales_sents = [s for s in sales_sents if clean_and_tokenize(s)]
    newton_sents = [s for s in newton_sents if clean_and_tokenize(s)]
    
    log_info(f"Loaded {len(sales_sents)} Sales sentences and {len(newton_sents)} Newton sentences.")
    
    # 2. Load the pre-trained combined Word2Vec model of the evaluator
    log_info("Loading pre-trained Word2Vec model...")
    if not policy_config.W2V_MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Pre-trained Word2Vec not found at {policy_config.W2V_MODEL_PATH}. "
            "Please train the Makes-Sense evaluator first."
        )
    from gensim.models import Word2Vec
    w2v = Word2Vec.load(str(policy_config.W2V_MODEL_PATH))
    
    # 3. Load the Makes-Sense evaluator
    log_info("Loading Makes-Sense evaluator model...")
    evaluator = MakesSenseEvaluator(w2v_path=policy_config.W2V_MODEL_PATH)
    
    # Instantiate searchers for each domain
    sales_searcher = AlphaLMSearcher(sales_sents, w2v, makes_sense_evaluator=evaluator)
    newton_searcher = AlphaLMSearcher(newton_sents, w2v, makes_sense_evaluator=evaluator)
    
    all_samples = []
    
    # We want to run a set of search configurations to get a diverse dataset
    # We will run 15 searches per configuration to avoid taking too much time,
    # but still gathering enough samples (~30,000+).
    configs = [
        # (searcher, label, makes_sense_weight, num_runs)
        (sales_searcher, "sales_with_eval", 1.5, 12),
        (sales_searcher, "sales_without_eval", 0.0, 12),
        (newton_searcher, "newton_with_eval", 1.5, 12),
        (newton_searcher, "newton_without_eval", 0.0, 12),
    ]
    
    for searcher, desc, ms_weight, num_runs in configs:
        log_info(f"Generating policy logs for configuration: {desc} ({num_runs} runs)...")
        weights = {
            "boundary": 1.0,
            "local": 0.5,
            "global": 0.5,
            "completion": 0.0,
            "makes_sense": ms_weight
        }
        
        # Pick random distinct seed indices
        seed_indices = random.sample(range(len(searcher.sentences)), min(num_runs, len(searcher.sentences)))
        
        for idx, seed_idx in enumerate(seed_indices):
            log_info(f"  Run {idx+1}/{num_runs} with seed index {seed_idx}...")
            run_samples = generate_policy_data(
                searcher=searcher,
                seed_idx=seed_idx,
                num_sentences=6, # Use 6 sentences to gather trajectory history
                beam_width=4,
                weights=weights
            )
            all_samples.extend(run_samples)
            log_info(f"  Collected {len(run_samples)} samples from run.")
            
    log_info(f"Total policy transition samples collected: {len(all_samples)}")
    
    # Shuffle and split into Train/Val/Test
    random.shuffle(all_samples)
    
    n = len(all_samples)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_data = all_samples[:train_end]
    val_data = all_samples[train_end:val_end]
    test_data = all_samples[val_end:]
    
    # Save datasets
    policy_config.PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    for path, data in [
        (policy_config.TRAIN_DATA_PATH, train_data),
        (policy_config.VAL_DATA_PATH, val_data),
        (policy_config.TEST_DATA_PATH, test_data)
    ]:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log_info(f"Saved {len(data)} samples to: {path}")

if __name__ == "__main__":
    main()
