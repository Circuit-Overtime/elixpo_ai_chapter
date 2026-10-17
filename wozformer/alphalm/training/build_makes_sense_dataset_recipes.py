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

def find_near_miss_recipe(sent_idx: int, all_sents: List[str], sentence_embeddings: List[np.ndarray]) -> str:
    """Finds a sentence semantically similar to all_sents[sent_idx] from elsewhere in the corpus."""
    target_emb = sentence_embeddings[sent_idx]
    if np.linalg.norm(target_emb) == 0.0:
        return random.choice(all_sents)
        
    similarities = []
    # Pick a random sample to compare to save time
    sample_indices = random.sample(range(len(all_sents)), min(500, len(all_sents)))
    for idx in sample_indices:
        if abs(idx - sent_idx) < 10:
            continue
        emb = sentence_embeddings[idx]
        sim = cosine_similarity(target_emb, emb)
        similarities.append((sim, all_sents[idx]))
        
    similarities.sort(key=lambda x: x[0], reverse=True)
    top_candidates = similarities[:10]
    return random.choice(top_candidates)[1] if top_candidates else random.choice(all_sents)

def main():
    set_seed(root_config.SEED)
    
    corpus_path = ROOT_DIR / "recipes_5m.txt"
    if not corpus_path.exists():
        log_info("Error: recipes_5m.txt not found. Please run extract_recipes.py first.")
        sys.exit(1)
        
    # Load Word2Vec for near-miss matching
    w2v_path = ROOT_DIR / "models" / "recipes_word2vec.model"
    w2v = Word2Vec.load(str(w2v_path))
    
    # 1. Parse recipes
    log_info("Parsing recipes and sentences...")
    corpus_text = load_corpus(corpus_path)
    recipes_raw = corpus_text.split("<|endoftext|>")
    
    recipes_sents = []
    all_valid_sents = []
    
    for r_raw in recipes_raw:
        r_raw = r_raw.strip()
        if not r_raw:
            continue
        sents = split_into_sentences(r_raw)
        sents = [s for s in sents if clean_and_tokenize(s)]
        if len(sents) >= 3:
            recipes_sents.append(sents)
            all_valid_sents.extend(sents)
            
    log_info(f"Loaded {len(recipes_sents)} recipes containing {len(all_valid_sents)} sentences.")
    
    # Precompute sentence embeddings for near-miss mining
    log_info("Precomputing sentence embeddings for near-miss mining...")
    all_embs = [get_mean_vector(w2v, clean_and_tokenize(s)) for s in all_valid_sents]
    
    # Map from sentence text to index in all_valid_sents for fast lookup
    sent_to_idx = {sent: i for i, sent in enumerate(all_valid_sents)}
    
    # 2. Generate Sliding-window contrastive trajectories
    log_info("Generating contrastive trajectories...")
    pairs = []
    window_sizes = [3, 4, 5, 6]
    
    for recipe in recipes_sents:
        for w_size in window_sizes:
            if len(recipe) < w_size:
                continue
                
            for i in range(len(recipe) - w_size + 1):
                pos_traj = recipe[i : i + w_size]
                neg_traj = list(pos_traj)
                
                neg_type = random.choice([
                    "shuffle_all", "swap_adjacent", "swap_middle", "swap_end",
                    "random_insert", "cross_recipe_mixing", "near_miss", "wrong_endings"
                ])
                
                if neg_type == "shuffle_all":
                    random.shuffle(neg_traj)
                    if neg_traj == pos_traj:
                        neg_traj[-2], neg_traj[-1] = neg_traj[-1], neg_traj[-2]
                        
                elif neg_type == "swap_adjacent":
                    swap_idx = random.randint(0, w_size - 2)
                    neg_traj[swap_idx], neg_traj[swap_idx+1] = neg_traj[swap_idx+1], neg_traj[swap_idx]
                    
                elif neg_type == "swap_middle" and w_size >= 4:
                    neg_traj[1], neg_traj[2] = neg_traj[2], neg_traj[1]
                    
                elif neg_type == "swap_end":
                    neg_traj[-2], neg_traj[-1] = neg_traj[-1], neg_traj[-2]
                    
                elif neg_type == "random_insert":
                    replace_idx = random.randint(1, w_size - 1)
                    neg_traj[replace_idx] = random.choice(all_valid_sents)
                    
                elif neg_type == "cross_recipe_mixing":
                    # Replace last 2 sentences with sentences from a different recipe
                    other_recipe = random.choice([r for r in recipes_sents if r != recipe])
                    for idx in range(w_size - 2, w_size):
                        neg_traj[idx] = random.choice(other_recipe)
                        
                elif neg_type == "wrong_endings":
                    # Replace the last sentence with a sentence from the beginning (relative index 0 or 1) of another recipe
                    other_recipe = random.choice([r for r in recipes_sents if r != recipe])
                    neg_traj[-1] = other_recipe[0]
                    
                else: # "near_miss"
                    last_sent = pos_traj[-1]
                    s_idx = sent_to_idx.get(last_sent, random.randint(0, len(all_valid_sents)-1))
                    near_miss_sent = find_near_miss_recipe(s_idx, all_valid_sents, all_embs)
                    neg_traj[-1] = near_miss_sent
                    
                pairs.append({
                    "positive": pos_traj,
                    "negative": neg_traj,
                    "weight": 1.0,
                    "type": f"sliding_{neg_type}_w{w_size}"
                })
                
    random.shuffle(pairs)
    log_info(f"Generated {len(pairs)} contrastive pairs.")
    
    n = len(pairs)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_data = pairs[:train_end]
    val_data = pairs[train_end:val_end]
    test_data = pairs[val_end:]
    
    data_dir = ROOT_DIR / "models" / "makes_sense_recipes_data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    for filename, split_data in [("train.json", train_data), ("val.json", val_data), ("test.json", test_data)]:
        out_path = data_dir / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(split_data, f, ensure_ascii=False, indent=2)
        log_info(f"Saved {len(split_data)} makes-sense recipe samples to {out_path}")

if __name__ == "__main__":
    main()
