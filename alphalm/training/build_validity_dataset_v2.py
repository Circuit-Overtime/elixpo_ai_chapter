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

def generate_splice(sent_a: str, sent_b: str) -> str:
    words_a = sent_a.split()
    words_b = sent_b.split()
    if len(words_a) < 4 or len(words_b) < 4:
        return f"{sent_a} {sent_b}"
    
    idx_a = random.randint(len(words_a) // 3, 2 * len(words_a) // 3)
    idx_b = random.randint(len(words_b) // 3, 2 * len(words_b) // 3)
    
    splice_words = words_a[:idx_a] + words_b[idx_b:]
    return " ".join(splice_words)

def generate_phrase_swap(sent: str) -> str:
    words = sent.split()
    if len(words) < 5:
        return sent
    
    idx1 = random.randint(0, len(words) - 3)
    idx2 = random.randint(idx1 + 2, len(words) - 1)
    
    words[idx1], words[idx2] = words[idx2], words[idx1]
    return " ".join(words)

def generate_deletion(sent: str) -> str:
    words = sent.split()
    if len(words) < 5:
        return sent
    
    num_to_delete = random.randint(1, min(3, len(words) // 3))
    indices_to_delete = random.sample(range(len(words)), num_to_delete)
    
    corrupt_words = [words[i] for i in range(len(words)) if i not in indices_to_delete]
    return " ".join(corrupt_words)

def generate_insertion(sent: str, corpus_vocab: List[str]) -> str:
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
    """Aggressively merges the tail of sentence A and head of sentence B without punctuation."""
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

def generate_long_runon(corpus_sents: List[str]) -> str:
    """Stitches 3 to 4 random sentences together without punctuation to create a long messy run-on."""
    sents = random.sample(corpus_sents, random.randint(3, 4))
    cleaned = []
    for s in sents:
        cl = s.strip().rstrip(".,!?")
        if cl:
            cl = cl[0].lower() + cl[1:]
        cleaned.append(cl)
    return " ".join(cleaned)

def mine_generated_failures(ablation_dirs: List[Path], corpus_set: set) -> List[str]:
    failures = []
    for d in ablation_dirs:
        if not d.exists():
            continue
        for json_file in d.glob("*.json"):
            # Mine from logs where we didn't check for validity (Condition A/B)
            # or from general runs since stitched sentences are often noisy
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    run_data = json.load(f)
                gen_text = run_data.get("generated_text", "")
                if not gen_text:
                    continue
                sents = split_into_sentences(gen_text)
                for s in sents:
                    clean_s = " ".join(s.split())
                    # If sentence is not in the original corpus, it was stitched
                    if clean_s and clean_s not in corpus_set:
                        failures.append(clean_s)
            except Exception as e:
                pass
                
    failures = list(set(failures))
    log_info(f"Mined {len(failures)} unique generated failures from search logs.")
    return failures

def build_split(
    corpus_sents: List[str], 
    vocab: List[str], 
    mined_failures: List[str], 
    is_train: bool,
    target_size: int = None
) -> List[Dict[str, Any]]:
    """Generates balanced positives and negatives for a specific split."""
    positives = [{"text": s, "label": 1.0, "type": "corpus"} for s in corpus_sents]
    
    negatives = []
    if is_train:
        for f in mined_failures:
            negatives.append({"text": f, "label": 0.0, "type": "type7_mined_log_failure"})
            
    # Calculate needed negatives to match positive count
    needed = len(positives) - len(negatives)
    if needed > 0:
        # Distribute equally among the 6 negative corruption types
        per_type = needed // 6
        
        # Type 1: Splices
        for _ in range(per_type):
            s1 = random.choice(corpus_sents)
            s2 = random.choice(corpus_sents)
            negatives.append({"text": generate_splice(s1, s2), "label": 0.0, "type": "type1_splice"})
            
        # Type 2: Phrase swaps
        for _ in range(per_type):
            s = random.choice(corpus_sents)
            negatives.append({"text": generate_phrase_swap(s), "label": 0.0, "type": "type2_phrase_swap"})
            
        # Type 3: Deletions
        for _ in range(per_type):
            s = random.choice(corpus_sents)
            negatives.append({"text": generate_deletion(s), "label": 0.0, "type": "type3_deletion"})
            
        # Type 4: Insertions
        for _ in range(per_type):
            s = random.choice(corpus_sents)
            negatives.append({"text": generate_insertion(s, vocab), "label": 0.0, "type": "type4_insertion"})
            
        # Type 5: Boundary fusion
        for _ in range(per_type):
            s1 = random.choice(corpus_sents)
            s2 = random.choice(corpus_sents)
            negatives.append({"text": generate_boundary_fusion(s1, s2), "label": 0.0, "type": "type5_boundary_fusion"})
            
        # Type 6: Long run-on hybrids
        for _ in range(per_type):
            negatives.append({"text": generate_long_runon(corpus_sents), "label": 0.0, "type": "type6_long_runon"})
            
    # Balance perfectly
    while len(negatives) < len(positives):
        s1 = random.choice(corpus_sents)
        s2 = random.choice(corpus_sents)
        negatives.append({"text": generate_boundary_fusion(s1, s2), "label": 0.0, "type": "type5_boundary_fusion"})
        
    # Cap size if needed
    if target_size and len(positives) > target_size:
        positives = positives[:target_size]
        negatives = negatives[:target_size]
        
    dataset = positives + negatives
    random.shuffle(dataset)
    return dataset

def main():
    set_seed(root_config.SEED)
    
    sales_path = ROOT_DIR / "sales_dataset.txt"
    newton_path = ROOT_DIR / "newton_dataset.txt"
    ablation_dirs = [ROOT_DIR / "ablation_results", ROOT_DIR / "ablation_results_v5.5"]
    
    sales_text = load_corpus(sales_path)
    newton_text = load_corpus(newton_path)
    
    sales_sents = split_into_sentences(sales_text)
    newton_sents = split_into_sentences(newton_text)
    
    sales_sents = [s for s in sales_sents if len(clean_and_tokenize(s)) >= 4]
    newton_sents = [s for s in newton_sents if len(clean_and_tokenize(s)) >= 4]
    
    all_corpus_sents = sales_sents + newton_sents
    corpus_set = set(all_corpus_sents)
    
    log_info("Extracting corpus vocabulary...")
    vocab = []
    for s in all_corpus_sents:
        vocab.extend(clean_and_tokenize(s))
    vocab = list(set(vocab))
    if not vocab:
        vocab = ["customer", "sales", "gravity", "force", "product", "business"]
        
    mined_failures = mine_generated_failures(ablation_dirs, corpus_set)
    
    random.shuffle(all_corpus_sents)
    n = len(all_corpus_sents)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_sents = all_corpus_sents[:train_end]
    val_sents = all_corpus_sents[train_end:val_end]
    test_sents = all_corpus_sents[val_end:]
    
    log_info(f"Split raw corpus: {len(train_sents)} train, {len(val_sents)} val, {len(test_sents)} test.")
    
    train_data = build_split(train_sents, vocab, mined_failures, is_train=True)
    val_data = build_split(val_sents, vocab, [], is_train=False)
    test_data = build_split(test_sents, vocab, [], is_train=False)
    
    data_dir = ROOT_DIR / "models" / "validity_v2_data"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    for filename, split_data in [("train.json", train_data), ("val.json", val_data), ("test.json", test_data)]:
        out_path = data_dir / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(split_data, f, ensure_ascii=False, indent=2)
        log_info(f"Saved {len(split_data)} validity v2 samples to {out_path}")

if __name__ == "__main__":
    main()
