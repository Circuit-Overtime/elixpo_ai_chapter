import sys
import json
import random
import numpy as np
from pathlib import Path
from typing import List, Dict, Any
from gensim.models import Word2Vec

# Add parent directory to path
TRAINING_DIR = Path(__file__).resolve().parent
ROOT_DIR = TRAINING_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from embeddings import get_mean_vector
from similarity import cosine_similarity
from utils import log_info, set_seed

def find_near_miss(sent_idx: int, corpus_sents: List[str], sentence_embeddings: List[np.ndarray]) -> str:
    """Finds a sentence semantically similar to corpus_sents[sent_idx] from elsewhere in the corpus."""
    target_emb = sentence_embeddings[sent_idx]
    if np.linalg.norm(target_emb) == 0.0:
        rand_idx = random.randint(0, len(corpus_sents) - 1)
        while abs(rand_idx - sent_idx) < 10:
            rand_idx = random.randint(0, len(corpus_sents) - 1)
        return corpus_sents[rand_idx]
        
    similarities = []
    for idx, emb in enumerate(sentence_embeddings):
        if abs(idx - sent_idx) < 10:
            continue
        sim = cosine_similarity(target_emb, emb)
        similarities.append((sim, corpus_sents[idx]))
        
    similarities.sort(key=lambda x: x[0], reverse=True)
    top_candidates = similarities[:10]
    return random.choice(top_candidates)[1] if top_candidates else random.choice(corpus_sents)

def generate_trajectory_pairs(
    sales_sents: List[str],
    newton_sents: List[str],
    w2v: Word2Vec,
    ablation_dirs: List[Path]
) -> List[Dict[str, Any]]:
    """Generates contrastive pairwise trajectory samples (positive, negative, weight)."""
    pairs = []
    
    # Precompute sentence embeddings for near-miss mining
    log_info("Precomputing sentence embeddings for near-miss mining...")
    sales_embs = [get_mean_vector(w2v, clean_and_tokenize(s)) for s in sales_sents]
    newton_embs = [get_mean_vector(w2v, clean_and_tokenize(s)) for s in newton_sents]
    
    # 1. Slide windows of sizes 3, 4, 5, 6
    window_sizes = [3, 4, 5, 6]
    domains = [("sales", sales_sents, sales_embs, newton_sents), ("newton", newton_sents, newton_embs, sales_sents)]
    
    log_info("Generating sliding-window contrastive trajectories...")
    for w_size in window_sizes:
        for domain_name, sents, embs, other_sents in domains:
            limit = 1000
            count = 0
            for i in range(len(sents) - w_size + 1):
                if count >= limit:
                    break
                pos_traj = sents[i : i + w_size]
                
                # Corruption type
                neg_type = random.choice([
                    "shuffle_end", "swap_middle", "repeat_last",
                    "loop_first", "cross_domain", "random_insert",
                    "near_miss", "shuffle_all", "swap_adjacent"
                ])
                
                neg_traj = list(pos_traj)
                
                if neg_type == "shuffle_end" and w_size >= 3:
                    neg_traj[-2], neg_traj[-1] = neg_traj[-1], neg_traj[-2]
                    
                elif neg_type == "swap_middle" and w_size >= 4:
                    neg_traj[1], neg_traj[2] = neg_traj[2], neg_traj[1]
                    
                elif neg_type == "repeat_last" and w_size >= 3:
                    neg_traj[-1] = neg_traj[-2]
                    
                elif neg_type == "loop_first" and w_size >= 3:
                    neg_traj[-1] = neg_traj[0]
                    
                elif neg_type == "cross_domain":
                    replace_idx = random.randint(1, w_size - 1)
                    neg_traj[replace_idx] = random.choice(other_sents)
                    
                elif neg_type == "random_insert":
                    replace_idx = random.randint(1, w_size - 1)
                    neg_traj[replace_idx] = random.choice(sents)
                    
                elif neg_type == "shuffle_all" and w_size >= 3:
                    random.shuffle(neg_traj)
                    # avoid shuffle resulting in same order
                    if neg_traj == pos_traj:
                        neg_traj[-2], neg_traj[-1] = neg_traj[-1], neg_traj[-2]
                        
                elif neg_type == "swap_adjacent" and w_size >= 3:
                    swap_idx = random.randint(0, w_size - 2)
                    neg_traj[swap_idx], neg_traj[swap_idx+1] = neg_traj[swap_idx+1], neg_traj[swap_idx]
                    
                else: # "near_miss"
                    target_sent_idx = i + w_size - 1
                    near_miss_sent = find_near_miss(target_sent_idx, sents, embs)
                    neg_traj[-1] = near_miss_sent
                
                pairs.append({
                    "positive": pos_traj,
                    "negative": neg_traj,
                    "weight": 1.0,
                    "type": f"sliding_{domain_name}_{neg_type}_w{w_size}"
                })
                count += 1
                
    # 2. Mine Search-log failures from both directories
    log_info("Mining search logs for trajectory positives and negatives...")
    mined_count = 0
    for ablation_dir in ablation_dirs:
        if not ablation_dir.exists():
            continue
        log_info(f"  Reading logs from {ablation_dir.name}...")
        for json_file in ablation_dir.glob("*.json"):
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    run_data = json.load(f)
                path_indices = run_data["path_indices"]
                path_score = run_data["metrics"]["total_score"]
                decision_logs = run_data.get("decision_logs", [])
                
                if len(path_indices) < 3:
                    continue
                    
                # Tempered path weight (square root)
                weight = float(np.sqrt(max(1.0, float(path_score))) + 1.0)
                
                # Reconstruct sentences from indices
                # Note: Ablation studies ran on sales corpus
                run_sents = [sales_sents[idx] for idx in path_indices]
                
                for step_log in decision_logs:
                    step_num = step_log["step"]
                    if step_num < 2:
                        continue
                        
                    # Positive trajectory up to step
                    pos_traj = run_sents[:step_num + 1]
                    
                    # Negatives: parent path + top rejected candidates
                    rejected_candidates = step_log["rejected"]
                    for alt in rejected_candidates[:2]:
                        neg_traj = run_sents[:step_num] + [alt["text"]]
                        
                        pairs.append({
                            "positive": list(pos_traj),
                            "negative": list(neg_traj),
                            "weight": weight,
                            "type": "mined_search_failure"
                        })
                        mined_count += 1
            except Exception as e:
                pass
                
    log_info(f"Mined {mined_count} contrastive pairs from search logs.")
    return pairs

def main():
    set_seed(root_config.SEED)
    
    sales_path = ROOT_DIR / "sales_dataset.txt"
    newton_path = ROOT_DIR / "newton_dataset.txt"
    ablation_dirs = [ROOT_DIR / "ablation_results", ROOT_DIR / "ablation_results_v5.5"]
    
    sales_text = load_corpus(sales_path)
    newton_text = load_corpus(newton_path)
    
    sales_sents = split_into_sentences(sales_text)
    newton_sents = split_into_sentences(newton_text)
    
    sales_sents = [s for s in sales_sents if clean_and_tokenize(s)]
    newton_sents = [s for s in newton_sents if clean_and_tokenize(s)]
    
    w2v_path = ROOT_DIR / "evaluator" / "evaluator_w2v.model"
    w2v = Word2Vec.load(str(w2v_path))
    
    pairs = generate_trajectory_pairs(sales_sents, newton_sents, w2v, ablation_dirs)
    random.shuffle(pairs)
    
    n = len(pairs)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_data = pairs[:train_end]
    val_data = pairs[train_end:val_end]
    test_data = pairs[val_end:]
    
    data_dir = ROOT_DIR / "models" / "makes_sense_v2_1_data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    for filename, split_data in [("train.json", train_data), ("val.json", val_data), ("test.json", test_data)]:
        out_path = data_dir / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(split_data, f, ensure_ascii=False, indent=2)
        log_info(f"Saved {len(split_data)} contrastive pairs to {out_path}")

if __name__ == "__main__":
    main()
