import sys
import json
import random
from pathlib import Path
from typing import List, Dict, Any

# Add parent directory to sys.path to allow imports from root folder
EVALUATOR_DIR = Path(__file__).resolve().parent
sys.path.append(str(EVALUATOR_DIR.parent))

import config as root_config
import evaluator.eval_config as eval_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from embeddings import train_word2vec
from utils import log_info, set_seed

def build_dataset_samples(
    sales_sentences: List[str],
    newton_sentences: List[str],
    window_size: int,
    num_samples: int = 4000
) -> List[Dict[str, Any]]:
    """
    Generates balanced positive and negative trajectory windows of size window_size (K).
    """
    samples = []
    half_samples = num_samples // 2
    
    # 1. Positive Examples (Contiguous windows from same domain)
    log_info("Generating positive trajectory windows...")
    pos_count = 0
    
    # Positive Sales Windows
    sales_pos_limit = half_samples // 2
    for i in range(len(sales_sentences) - window_size + 1):
        if pos_count >= sales_pos_limit:
            break
        window = sales_sentences[i : i + window_size]
        samples.append({
            "sentences": window,
            "label": 1.0,
            "type": "positive_sales"
        })
        pos_count += 1
        
    # Positive Newton Windows
    newton_pos_limit = half_samples - pos_count
    for i in range(len(newton_sentences) - window_size + 1):
        if pos_count >= half_samples:
            break
        window = newton_sentences[i : i + window_size]
        samples.append({
            "sentences": window,
            "label": 1.0,
            "type": "positive_newton"
        })
        pos_count += 1
        
    log_info(f"Generated {pos_count} positive trajectory windows.")

    # 2. Negative Examples (Shuffled, mixed-domain, random insertions)
    log_info("Generating negative trajectory windows...")
    neg_count = 0
    
    while neg_count < half_samples:
        neg_type = random.choice(["shuffled", "insertion", "mixed_domain", "disconnected"])
        
        if neg_type == "shuffled":
            # Shuffle a contiguous window
            domain = random.choice(["sales", "newton"])
            sents = sales_sentences if domain == "sales" else newton_sentences
            start_idx = random.randint(0, len(sents) - window_size)
            window = list(sents[start_idx : start_idx + window_size])
            
            # Keep shuffling until order is actually changed
            shuffled_window = list(window)
            while shuffled_window == window and len(window) > 1:
                random.shuffle(shuffled_window)
                
            samples.append({
                "sentences": shuffled_window,
                "label": 0.0,
                "type": "neg_shuffled"
            })
            
        elif neg_type == "insertion":
            # Insert a random sentence from the other domain into a contiguous window
            domain = random.choice(["sales", "newton"])
            sents_a = sales_sentences if domain == "sales" else newton_sentences
            sents_b = newton_sentences if domain == "sales" else sales_sentences
            
            start_idx = random.randint(0, len(sents_a) - window_size)
            window = list(sents_a[start_idx : start_idx + window_size])
            
            # Replace one random slot in the window with a sentence from the other corpus
            replace_idx = random.randint(0, window_size - 1)
            window[replace_idx] = random.choice(sents_b)
            
            samples.append({
                "sentences": window,
                "label": 0.0,
                "type": "neg_insertion"
            })
            
        elif neg_type == "mixed_domain":
            # Combine sentences from both domains (e.g. 2 sales, 2 newton)
            half_w = window_size // 2
            idx_a = random.randint(0, len(sales_sentences) - half_w)
            idx_b = random.randint(0, len(newton_sentences) - (window_size - half_w))
            
            part_a = sales_sentences[idx_a : idx_a + half_w]
            part_b = newton_sentences[idx_b : idx_b + (window_size - half_w)]
            
            window = part_a + part_b
            if random.random() > 0.5:
                window = part_b + part_a
                
            samples.append({
                "sentences": window,
                "label": 0.0,
                "type": "neg_mixed"
            })
            
        else:  # disconnected
            # Randomly pick sentences far apart from the same domain
            domain = random.choice(["sales", "newton"])
            sents = sales_sentences if domain == "sales" else newton_sentences
            window = [random.choice(sents) for _ in range(window_size)]
            
            samples.append({
                "sentences": window,
                "label": 0.0,
                "type": "neg_disconnected"
            })
            
        neg_count += 1
        
    log_info(f"Generated {neg_count} negative trajectory windows.")
    return samples

def main():
    set_seed(eval_config.SEED)
    
    # 1. Load raw text files
    sales_text = load_corpus(eval_config.SALES_RAW_PATH)
    newton_text = load_corpus(eval_config.NEWTON_RAW_PATH)
    
    # 2. Split into sentences
    sales_sents = split_into_sentences(sales_text)
    newton_sents = split_into_sentences(newton_text)
    
    log_info(f"Sales: {len(sales_sents)} sentences. Newton: {len(newton_sents)} sentences.")
    
    # 3. Train combined Word2Vec model on both datasets
    all_sents = sales_sents + newton_sents
    log_info("Tokenizing combined corpus for Word2Vec training...")
    tokenized_sents = [clean_and_tokenize(s) for s in all_sents if s.strip()]
    tokenized_sents = [t for t in tokenized_sents if t]
    
    log_info(f"Training combined Word2Vec model on {len(tokenized_sents)} sentences...")
    w2v = train_word2vec(tokenized_sents)
    
    # Save the model
    eval_config.W2V_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    w2v.save(str(eval_config.W2V_MODEL_PATH))
    log_info(f"Saved combined Word2Vec model to: {eval_config.W2V_MODEL_PATH}")
    
    # 4. Generate positive and negative samples
    samples = build_dataset_samples(
        sales_sents,
        newton_sents,
        window_size=eval_config.WINDOW_SIZE,
        num_samples=4000
    )
    
    # Shuffle all samples to mix positive and negative cases
    random.shuffle(samples)
    
    # 5. Split and Save Datasets
    n = len(samples)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_samples = samples[:train_end]
    val_samples = samples[train_end:val_end]
    test_samples = samples[val_end:]
    
    eval_config.PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    for path, data in [
        (eval_config.TRAIN_DATA_PATH, train_samples),
        (eval_config.VAL_DATA_PATH, val_samples),
        (eval_config.TEST_DATA_PATH, test_samples)
    ]:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log_info(f"Saved {len(data)} samples to: {path}")

if __name__ == "__main__":
    main()
