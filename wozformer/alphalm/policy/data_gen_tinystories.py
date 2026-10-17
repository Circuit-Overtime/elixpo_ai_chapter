import sys
import json
import random
from pathlib import Path
from typing import List, Dict, Any
from collections import defaultdict
from gensim.models import Word2Vec

# Add parent directory to sys.path
POLICY_DIR = Path(__file__).resolve().parent
ROOT_DIR = POLICY_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from search import AlphaLMSearcher, SearchPath
from models.makes_sense_v2_1 import DeepMakesSenseEvaluatorV2_1
from models.sentence_validity_v2 import SentenceValidityEvaluatorV2
from similarity import cosine_similarity
from utils import log_info, set_seed

def generate_policy_data(
    searcher: AlphaLMSearcher,
    seed_idx: int,
    num_sentences: int,
    beam_width: int,
    weights: dict
) -> List[dict]:
    """Runs beam search on the corpus and returns balanced positive and negative transition samples."""
    if seed_idx < 0 or seed_idx >= len(searcher.sentences):
        return []
        
    beams = [SearchPath(sentence_indices=[seed_idx], total_score=0.0)]
    collected_samples = []
    
    # Pre-populate sentence embeddings
    for step in range(1, num_sentences):
        step_evaluations = []
        
        # Batch evaluation for each path in beam
        for path in beams:
            last_idx = path.sentence_indices[-1]
            makes_sense_cache = {}
            w_makes_sense = weights.get("makes_sense", 0.0)
            
            # Fast heuristic pruning using precomputed sentence embeddings
            last_vec = searcher.sentence_vecs[last_idx]
            similarities = []
            for cand_idx in range(len(searcher.sentences)):
                if cand_idx == last_idx:
                    continue
                if cand_idx in path.sentence_indices:
                    continue
                cand_vec = searcher.sentence_vecs[cand_idx]
                sim = cosine_similarity(last_vec, cand_vec)
                similarities.append((sim, cand_idx))
                
            similarities.sort(key=lambda x: x[0], reverse=True)
            # Keep top 150 semantically coherent candidates
            candidate_indices = [idx for _, idx in similarities[:150]]
            
            # Optimize makes-sense scoring using the batch scorer
            if searcher.makes_sense_evaluator is not None and w_makes_sense > 0.0:
                history_sentences = [searcher.sentences[idx] for idx in path.sentence_indices]
                filtered_sents = [searcher.sentences[idx] for idx in candidate_indices]
                scores = searcher.makes_sense_evaluator.score_candidates(history_sentences, filtered_sents)
                makes_sense_cache = {idx: score for idx, score in zip(candidate_indices, scores)}
                
            for cand_idx in candidate_indices:
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
        new_paths_scored = []
        for eval_item in step_evaluations:
            new_score = eval_item["path_obj"].total_score + eval_item["score"]
            new_paths_scored.append((new_score, eval_item))
            
        new_paths_scored.sort(key=lambda x: x[0], reverse=True)
        
        # Keep only the top beam_width paths
        surviving_items = new_paths_scored[:beam_width]
        surviving_paths = [item[1]["parent_path"] + [item[1]["cand_idx"]] for item in surviving_items]
        surviving_set = set(tuple(p) for p in surviving_paths)
        
        # Group by parent path
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
    set_seed(root_config.SEED)
    
    log_info("Loading TinyStories corpus...")
    corpus_path = ROOT_DIR / "tinystories_1m.txt"
    corpus_text = load_corpus(corpus_path)
    stories = corpus_text.split("<|endoftext|>")
    sentences = []
    for story in stories:
        if story.strip():
            sentences.extend(split_into_sentences(story))
    valid_sentences = [s for s in sentences if clean_and_tokenize(s)]
    
    log_info(f"Loaded {len(valid_sentences)} sentences.")
    
    # Load custom trained models
    log_info("Loading TinyStories models...")
    w2v_path = ROOT_DIR / "models" / "tinystories_word2vec.model"
    w2v = Word2Vec.load(str(w2v_path))
    
    ms_path = ROOT_DIR / "models" / "makes_sense_tinystories.pt"
    ms_eval = DeepMakesSenseEvaluatorV2_1(model_path=ms_path, w2v_path=w2v_path)
    
    val_path = ROOT_DIR / "models" / "validity_tinystories.pt"
    val_eval = SentenceValidityEvaluatorV2(model_path=val_path, w2v_path=w2v_path, corpus_path=corpus_path)
    
    searcher = AlphaLMSearcher(
        corpus_sentences=valid_sentences,
        w2v_model=w2v,
        makes_sense_evaluator=ms_eval,
        sentence_validity_evaluator=val_eval
    )
    
    all_samples = []
    
    # We will run 35 searches to collect ~20,000+ policy transitions
    num_runs = 35
    log_info(f"Generating policy logs for TinyStories ({num_runs} runs)...")
    
    weights = {
        "boundary": 1.0,
        "local": 0.5,
        "global": 0.5,
        "completion": 0.0,
        "makes_sense": 1.5,
        "policy": 0.0, # Policy Head is not trained yet, so w_policy = 0.0
        "validity": 1.0
    }
    
    # Pick random distinct seed indices
    seed_indices = random.sample(range(len(searcher.sentences)), min(num_runs, len(searcher.sentences)))
    
    for idx, seed_idx in enumerate(seed_indices):
        log_info(f"  Run {idx+1}/{num_runs} with seed index {seed_idx}...")
        run_samples = generate_policy_data(
            searcher=searcher,
            seed_idx=seed_idx,
            num_sentences=6, # Standard window 6
            beam_width=4,
            weights=weights
        )
        all_samples.extend(run_samples)
        log_info(f"  Collected {len(run_samples)} samples.")
        
    log_info(f"Total policy transition samples collected: {len(all_samples)}")
    
    # Shuffle and split into Train/Val/Test
    random.shuffle(all_samples)
    n = len(all_samples)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_data = all_samples[:train_end]
    val_data = all_samples[train_end:val_end]
    test_data = all_samples[val_end:]
    
    processed_dir = ROOT_DIR / "policy" / "data_tinystories"
    processed_dir.mkdir(parents=True, exist_ok=True)
    
    for path_name, data in [
        ("train.json", train_data),
        ("val.json", val_data),
        ("test.json", test_data)
    ]:
        out_path = processed_dir / path_name
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log_info(f"Saved {len(data)} samples to: {out_path}")

if __name__ == "__main__":
    main()
