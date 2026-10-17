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

def train_bigram_model(corpus_sents: list):
    bigrams = defaultdict(Counter)
    unigrams = Counter()
    
    for sent in corpus_sents:
        tokens = clean_and_tokenize(sent)
        if not tokens:
            continue
        tokens = ["<s>"] + tokens + ["</s>"]
        for i in range(len(tokens) - 1):
            w1, w2 = tokens[i], tokens[i+1]
            bigrams[w1][w2] += 1
            unigrams[w1] += 1
            
    return bigrams, unigrams

def score_sentence(sentence: str, bigrams: dict, unigrams: dict, vocab_size: int) -> float:
    tokens = clean_and_tokenize(sentence)
    if not tokens:
        return -999.0
    tokens = ["<s>"] + tokens + ["</s>"]
    log_prob = 0.0
    for i in range(len(tokens) - 1):
        w1, w2 = tokens[i], tokens[i+1]
        # Add-k smoothing (k=0.01)
        k = 0.01
        count_w1_w2 = bigrams[w1][w2]
        count_w1 = unigrams[w1]
        prob = (count_w1_w2 + k) / (count_w1 + k * vocab_size)
        log_prob += np.log(prob)
    return log_prob / len(tokens)

def main():
    sales_path = ROOT_DIR / "sales_dataset.txt"
    newton_path = ROOT_DIR / "newton_dataset.txt"
    
    sales_text = load_corpus(sales_path)
    newton_text = load_corpus(newton_path)
    
    sales_sents = split_into_sentences(sales_text)
    newton_sents = split_into_sentences(newton_text)
    
    all_corpus_sents = sales_sents + newton_sents
    
    # Train the bigram model on the corpus
    bigrams, unigrams = train_bigram_model(all_corpus_sents)
    vocab_size = len(unigrams)
    
    data_dir = ROOT_DIR / "models" / "validity_data"
    with open(data_dir / "train.json", "r", encoding="utf-8") as f:
        train_samples = json.load(f)
    with open(data_dir / "test.json", "r", encoding="utf-8") as f:
        test_samples = json.load(f)
        
    # Extract bigram scores
    train_scores = [score_sentence(s["text"], bigrams, unigrams, vocab_size) for s in train_samples]
    train_labels = [s["label"] for s in train_samples]
    
    test_scores = [score_sentence(s["text"], bigrams, unigrams, vocab_size) for s in test_samples]
    test_labels = [s["label"] for s in test_samples]
    
    # Find the best classification threshold on train set
    best_threshold = -5.0
    best_acc = 0.0
    for threshold in np.linspace(-15.0, -1.0, 500):
        preds = [1.0 if score >= threshold else 0.0 for score in train_scores]
        acc = np.mean([1.0 if p == l else 0.0 for p, l in zip(preds, train_labels)])
        if acc > best_acc:
            best_acc = acc
            best_threshold = threshold
            
    # Apply to test set
    test_preds = [1.0 if score >= best_threshold else 0.0 for score in test_scores]
    test_acc = np.mean([1.0 if p == l else 0.0 for p, l in zip(test_preds, test_labels)])
    
    print(f"Best Training Threshold: {best_threshold:.4f}")
    print(f"Training Accuracy: {best_acc*100:.2f}%")
    print(f"Test Accuracy using Bigram Language Model: {test_acc*100:.2f}%")

if __name__ == "__main__":
    main()
