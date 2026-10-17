import sys
import json
import numpy as np
from pathlib import Path
from collections import defaultdict, Counter

# Add parent directory to path
SCRATCH_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRATCH_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize

def get_corpus_bigrams(corpus_sents: list):
    bigram_set = set()
    for sent in corpus_sents:
        tokens = clean_and_tokenize(sent)
        if not tokens:
            continue
        for i in range(len(tokens) - 1):
            bigram_set.add((tokens[i], tokens[i+1]))
    return bigram_set

def evaluate_sentence(sentence: str, corpus_bigrams: set) -> float:
    tokens = clean_and_tokenize(sentence)
    if not tokens:
        return 0.0 # invalid/empty
    if len(tokens) < 2:
        return 1.0 # too short to have bigrams, assume valid
        
    unseen_count = 0
    for i in range(len(tokens) - 1):
        bigram = (tokens[i], tokens[i+1])
        if bigram not in corpus_bigrams:
            unseen_count += 1
            
    # Return fraction of seen bigrams
    return 1.0 - (unseen_count / (len(tokens) - 1))

def main():
    sales_path = ROOT_DIR / "sales_dataset.txt"
    newton_path = ROOT_DIR / "newton_dataset.txt"
    
    sales_text = load_corpus(sales_path)
    newton_text = load_corpus(newton_path)
    
    sales_sents = split_into_sentences(sales_text)
    newton_sents = split_into_sentences(newton_text)
    
    all_corpus_sents = sales_sents + newton_sents
    
    # Extract all bigrams in the corpus
    corpus_bigrams = get_corpus_bigrams(all_corpus_sents)
    print(f"Total unique bigrams in corpus: {len(corpus_bigrams)}")
    
    data_dir = ROOT_DIR / "models" / "validity_data"
    with open(data_dir / "train.json", "r", encoding="utf-8") as f:
        train_samples = json.load(f)
    with open(data_dir / "test.json", "r", encoding="utf-8") as f:
        test_samples = json.load(f)
        
    # Evaluate
    train_scores = [evaluate_sentence(s["text"], corpus_bigrams) for s in train_samples]
    train_labels = [s["label"] for s in train_samples]
    
    test_scores = [evaluate_sentence(s["text"], corpus_bigrams) for s in test_samples]
    test_labels = [s["label"] for s in test_samples]
    
    # We classify as positive if score is 1.0 (all bigrams seen), else negative
    train_preds = [1.0 if score >= 1.0 else 0.0 for score in train_scores]
    train_acc = np.mean([1.0 if p == l else 0.0 for p, l in zip(train_preds, train_labels)])
    
    test_preds = [1.0 if score >= 1.0 else 0.0 for score in test_scores]
    test_acc = np.mean([1.0 if p == l else 0.0 for p, l in zip(test_preds, test_labels)])
    
    print(f"Training Accuracy: {train_acc*100:.2f}%")
    print(f"Test Accuracy using Seen-Bigram Fraction: {test_acc*100:.2f}%")

if __name__ == "__main__":
    main()
