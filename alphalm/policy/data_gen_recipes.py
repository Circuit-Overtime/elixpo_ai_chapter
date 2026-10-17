import sys
import json
import random
from pathlib import Path
from typing import List, Dict, Any
from collections import defaultdict
from gensim.models import Word2Vec
import numpy as np

# Add parent directory to sys.path
POLICY_DIR = Path(__file__).resolve().parent
ROOT_DIR = POLICY_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from search import AlphaLMSearcher, SearchPath
from models.makes_sense_transformer import DeepMakesSenseEvaluatorTransformer
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
        
    # Initialize the seed path with the seed sentence embedding and topic memory
    seed_vec = searcher.sentence_vecs[seed_idx]
    seed_path = SearchPath(
        sentence_indices=[seed_idx],
        total_score=0.0,
        sentence_embeddings=[seed_vec],
        topic_memory=seed_vec.copy(),
    )
    beams = [seed_path]
    collected_samples = []
    
    # Pre-normalize all sentence embeddings for vectorized cosine similarity
    sentence_vecs_matrix = np.stack(searcher.sentence_vecs)
    norms = np.linalg.norm(sentence_vecs_matrix, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0
    sentence_vecs_normed = sentence_vecs_matrix / norms
    
    for step in range(1, num_sentences):
        step_evaluations = []
        
        # Batch evaluation for each path in beam
        for path in beams:
            last_idx = path.sentence_indices[-1]
            makes_sense_cache = {}
            w_makes_sense = weights.get("makes_sense", 0.0)
            
            # Fast heuristic pruning using precomputed sentence embeddings
            last_vec = searcher.sentence_vecs[last_idx]
            last_norm = np.linalg.norm(last_vec)
            if last_norm == 0.0:
                sims = np.zeros(len(searcher.sentences))
            else:
                last_vec_normed = last_vec / last_norm
                sims = np.dot(sentence_vecs_normed, last_vec_normed)
            
            # Mask out last_idx and indices in path.sentence_indices
            mask = np.ones(len(searcher.sentences), dtype=bool)
            mask[last_idx] = False
            mask[path.sentence_indices] = False
            
            indices = np.where(mask)[0]
            masked_sims = sims[mask]
            
            if len(masked_sims) > 150:
                # Top 150 indices
                top_k_indices_local = np.argpartition(masked_sims, -150)[-150:]
                # Sort descending
                top_k_indices_local = top_k_indices_local[np.argsort(-masked_sims[top_k_indices_local])]
                candidate_indices = indices[top_k_indices_local].tolist()
            else:
                sort_idx = np.argsort(-masked_sims)
                candidate_indices = indices[sort_idx].tolist()
            
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
                    precomputed_makes_sense=makes_sense_cache.get(cand_idx, None),
                    history_vecs=path.sentence_embeddings,
                    topic_memory_vec=path.topic_memory
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
            
            # Update repetition embeddings and topic memory
            cand_vec = searcher.sentence_vecs[item["cand_idx"]]
            new_path.sentence_embeddings.append(cand_vec)
            all_vecs = np.stack(new_path.sentence_embeddings)
            new_path.topic_memory = np.mean(all_vecs, axis=0)
            
            beams.append(new_path)
            
    return collected_samples

def main():
    set_seed(root_config.SEED)
    
    log_info("Loading recipes corpus...")
    corpus_path = ROOT_DIR / "recipes_5m.txt"
    corpus_text = load_corpus(corpus_path)
    recipes = corpus_text.split("<|endoftext|>")
    sentences = []
    for r in recipes:
        if r.strip():
            sentences.extend(split_into_sentences(r))
    import re
    any_word_char = re.compile(r'\w')
    valid_sentences = [s for s in sentences if any_word_char.search(s)]
    
    log_info(f"Loaded {len(valid_sentences)} sentences.")
    
    # Load custom trained recipe models
    log_info("Loading recipe models...")
    w2v_path = ROOT_DIR / "models" / "recipes_word2vec.model"
    w2v = Word2Vec.load(str(w2v_path))
    
    ms_path = ROOT_DIR / "models" / "makes_sense_recipes_transformer.pt"
    ms_eval = DeepMakesSenseEvaluatorTransformer(model_path=ms_path, w2v_path=w2v_path)
    
    searcher = AlphaLMSearcher(
        corpus_sentences=valid_sentences,
        w2v_model=w2v,
        makes_sense_evaluator=ms_eval,
        sentence_validity_evaluator=None
    )
    
    val_path = ROOT_DIR / "models" / "validity_recipes_bigru.pt"
    # Pass valid_sentences as a list to avoid reloading/re-splitting corpus
    # Since searcher has already batch-tokenized them, clean_and_tokenize hits _TOKEN_CACHE instantly!
    val_eval = SentenceValidityEvaluatorV2(model_path=val_path, w2v_path=w2v_path, corpus_path=valid_sentences)
    
    searcher.sentence_validity_evaluator = val_eval
    # Pre-populate validity scores cache in batched GPU evaluations
    log_info("Pre-populating sentence validity evaluator cache...")
    scores = val_eval.score_sentences(searcher.sentences)
    searcher.validity_scores_cache = {idx: score for idx, score in enumerate(scores)}
    
    all_samples = []
    
    # We will run 35 searches to collect ~20,000+ policy transitions
    num_runs = 35
    log_info(f"Generating policy logs for recipes ({num_runs} runs)...")
    
    weights = {
        "boundary": 1.0,
        "local": 0.5,
        "global": 0.5,
        "completion": 0.0,
        "makes_sense": 1.5,
        "policy": 0.0, # policy head is 0.0
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
        
    log_info(f"Total recipe policy transition samples collected: {len(all_samples)}")
    
    # Shuffle and split into Train/Val/Test
    random.shuffle(all_samples)
    n = len(all_samples)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_data = all_samples[:train_end]
    val_data = all_samples[train_end:val_end]
    test_data = all_samples[val_end:]
    
    processed_dir = ROOT_DIR / "policy" / "data_recipes"
    processed_dir.mkdir(parents=True, exist_ok=True)
    
    for path_name, data in [
        ("train.json", train_data),
        ("val.json", val_data),
        ("test.json", test_data)
    ]:
        out_path = processed_dir / path_name
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log_info(f"Saved {len(data)} recipe policy samples to: {out_path}")

if __name__ == "__main__":
    main()
