import sys
import json
import random
from pathlib import Path
from typing import List, Dict, Any

# Add parent directory to path
TRAINING_DIR = Path(__file__).resolve().parent
ROOT_DIR = TRAINING_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from utils import log_info, set_seed

# ── Corruption Functions ───────────────────────────────────────────────────

def generate_splice(sent_a: str, sent_b: str) -> str:
    """Type 1: Splice first half of A and second half of B."""
    words_a = sent_a.split()
    words_b = sent_b.split()
    if len(words_a) < 4 or len(words_b) < 4:
        return f"{sent_a} {sent_b}"
    
    idx_a = random.randint(len(words_a) // 3, 2 * len(words_a) // 3)
    idx_b = random.randint(len(words_b) // 3, 2 * len(words_b) // 3)
    
    splice_words = words_a[:idx_a] + words_b[idx_b:]
    return " ".join(splice_words)

def generate_deletion(sent: str) -> str:
    """Type 2: Word deletion (delete 1-3 random words)."""
    words = sent.split()
    if len(words) < 5:
        return sent
    num_to_delete = random.randint(1, min(3, len(words) // 3))
    indices = random.sample(range(len(words)), num_to_delete)
    corrupt = [words[i] for i in range(len(words)) if i not in indices]
    return " ".join(corrupt)

def generate_phrase_deletion(sent: str) -> str:
    """Type 3: Phrase deletion (delete a contiguous block of 2-5 words)."""
    words = sent.split()
    if len(words) < 6:
        return sent
    phrase_len = random.randint(2, min(5, len(words) // 2))
    start_idx = random.randint(0, len(words) - phrase_len)
    corrupt = words[:start_idx] + words[start_idx + phrase_len:]
    return " ".join(corrupt)

def generate_phrase_insertion(sent: str, corpus_vocab: List[str]) -> str:
    """Type 4: Phrase insertion (insert 1-2 random words from vocab)."""
    words = sent.split()
    if not words:
        return sent
    num_to_insert = random.randint(1, 2)
    for _ in range(num_to_insert):
        insert_word = random.choice(corpus_vocab)
        insert_idx = random.randint(0, len(words))
        words.insert(insert_idx, insert_word)
    return " ".join(words)

def generate_boundary_fusion(sent_a: str, sent_b: str) -> str:
    """Type 5: Boundary fusion (merge tail of A and head of B without punctuation)."""
    words_a = sent_a.split()
    words_b = sent_b.split()
    
    if len(words_a) < 3 or len(words_b) < 3:
        clean_a = sent_a.strip().rstrip(".,!?")
        clean_b = sent_b.strip()
        if clean_b:
            clean_b = clean_b[0].lower() + clean_b[1:]
        return f"{clean_a} {clean_b}"
        
    tail_a = words_a[-random.randint(3, min(5, len(words_a))):]
    head_b = words_b[:random.randint(3, min(5, len(words_b))):]
    
    tail_a[-1] = tail_a[-1].rstrip(".,!?")
    if head_b:
        head_b[0] = head_b[0].lower()
        
    return " ".join(tail_a + head_b)

def generate_word_order_corruption(sent: str) -> str:
    """Type 6: Shuffle a contiguous span of words in the sentence."""
    words = sent.split()
    if len(words) < 5:
        return sent
    span_len = random.randint(3, min(5, len(words)))
    start_idx = random.randint(0, len(words) - span_len)
    
    span = words[start_idx : start_idx + span_len]
    random.shuffle(span)
    # Ensure it's not identical
    if span == words[start_idx : start_idx + span_len] and len(span) > 1:
        span[0], span[-1] = span[-1], span[0]
        
    corrupt = words[:start_idx] + span + words[start_idx + span_len:]
    return " ".join(corrupt)

def generate_mixed_fragments(sent_a: str, sent_b: str) -> str:
    """Type 7: Mix fragments from two sentences (e.g. first half of A and first half of B)."""
    words_a = sent_a.split()
    words_b = sent_b.split()
    if len(words_a) < 4 or len(words_b) < 4:
        return f"{sent_a} {sent_b}"
    idx_a = len(words_a) // 2
    idx_b = len(words_b) // 2
    return " ".join(words_a[:idx_a] + words_b[:idx_b])

def generate_simulated_failures(corpus_sents: List[str]) -> str:
    """Type 8: Simulated generated failures. Replicates bad search transitions
    by stitching 3 random sentences from different stories without punctuation."""
    sents = random.sample(corpus_sents, 3)
    cleaned = []
    for s in sents:
        cl = s.strip().rstrip(".,!?")
        if cl:
            cl = cl[0].lower() + cl[1:]
        cleaned.append(cl)
    return " ".join(cleaned)

# ───────────────────────────────────────────────────────────────────────────

def build_split(corpus_sents: List[str], vocab: List[str], target_size: int = None) -> List[Dict[str, Any]]:
    positives = [{"text": s, "label": 1.0, "type": "corpus"} for s in corpus_sents]
    negatives = []
    
    # Generate balanced negatives distribute across 8 types
    needed = len(positives)
    per_type = needed // 8
    
    # 1. Splices
    for _ in range(per_type):
        s1, s2 = random.sample(corpus_sents, 2)
        negatives.append({"text": generate_splice(s1, s2), "label": 0.0, "type": "type1_splice"})
        
    # 2. Deletions
    for _ in range(per_type):
        s = random.choice(corpus_sents)
        negatives.append({"text": generate_deletion(s), "label": 0.0, "type": "type2_deletion"})
        
    # 3. Phrase Deletions
    for _ in range(per_type):
        s = random.choice(corpus_sents)
        negatives.append({"text": generate_phrase_deletion(s), "label": 0.0, "type": "type3_phrase_del"})
        
    # 4. Phrase Insertions
    for _ in range(per_type):
        s = random.choice(corpus_sents)
        negatives.append({"text": generate_phrase_insertion(s, vocab), "label": 0.0, "type": "type4_phrase_ins"})
        
    # 5. Boundary Fusion
    for _ in range(per_type):
        s1, s2 = random.sample(corpus_sents, 2)
        negatives.append({"text": generate_boundary_fusion(s1, s2), "label": 0.0, "type": "type5_boundary_fusion"})
        
    # 6. Word Order Corruption
    for _ in range(per_type):
        s = random.choice(corpus_sents)
        negatives.append({"text": generate_word_order_corruption(s), "label": 0.0, "type": "type6_word_order"})
        
    # 7. Mixed Fragments
    for _ in range(per_type):
        s1, s2 = random.sample(corpus_sents, 2)
        negatives.append({"text": generate_mixed_fragments(s1, s2), "label": 0.0, "type": "type7_mixed_fragments"})
        
    # 8. Generated Failures (Simulated run-ons)
    for _ in range(needed - len(negatives)):
        negatives.append({"text": generate_simulated_failures(corpus_sents), "label": 0.0, "type": "type8_generated_failure"})
        
    dataset = positives + negatives
    random.shuffle(dataset)
    
    if target_size and len(dataset) > target_size * 2:
        dataset = dataset[:target_size * 2]
        
    return dataset

def main():
    set_seed(root_config.SEED)
    
    corpus_path = ROOT_DIR / "tinystories_1m.txt"
    if not corpus_path.exists():
        log_info("Error: tinystories_1m.txt not found. Please run extract_tinystories.py first.")
        sys.exit(1)
        
    corpus_text = load_corpus(corpus_path)
    stories = corpus_text.split("<|endoftext|>")
    sentences = []
    for story in stories:
        if story.strip():
            sentences.extend(split_into_sentences(story))
    
    # Filter short sentences
    valid_sents = [s for s in sentences if len(clean_and_tokenize(s)) >= 4]
    log_info(f"Loaded {len(valid_sents)} valid sentences from TinyStories subset.")
    
    # Build vocabulary
    vocab = []
    for s in valid_sents:
        vocab.extend(clean_and_tokenize(s))
    vocab = list(set(vocab))
    
    random.shuffle(valid_sents)
    n = len(valid_sents)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_sents = valid_sents[:train_end]
    val_sents = valid_sents[train_end:val_end]
    test_sents = valid_sents[val_end:]
    
    log_info(f"Splits: {len(train_sents)} train, {len(val_sents)} val, {len(test_sents)} test.")
    
    # Generate datasets
    train_data = build_split(train_sents, vocab)
    val_data = build_split(val_sents, vocab)
    test_data = build_split(test_sents, vocab)
    
    data_dir = ROOT_DIR / "models" / "validity_tinystories_data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    for filename, split_data in [("train.json", train_data), ("val.json", val_data), ("test.json", test_data)]:
        out_path = data_dir / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(split_data, f, ensure_ascii=False, indent=2)
        log_info(f"Saved {len(split_data)} validity samples to {out_path}")

if __name__ == "__main__":
    main()
