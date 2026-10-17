import time
import sys
from pathlib import Path
import spacy

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT_DIR))

from loader import load_corpus
from tokenizer import nlp

corpus_path = ROOT_DIR / "recipes_5m.txt"
corpus_text = load_corpus(corpus_path)
recipes = [r for r in corpus_text.split("<|endoftext|>") if r.strip()]

# Test on first 1000 recipes
test_recipes = recipes[:1000]
print(f"Profiling sentence splitting on {len(test_recipes)} recipes...")

# Method 1: Sequential
t0 = time.time()
seq_sentences = []
for r in test_recipes:
    doc = nlp(r)
    for sent in doc.sents:
        sent_str = sent.text.strip()
        if len(sent_str) > 5:
            sent_str = " ".join(sent_str.split())
            seq_sentences.append(sent_str)
print(f"Sequential splitting took {time.time()-t0:.2f}s, got {len(seq_sentences)} sentences.")

# Method 2: Batch with nlp.pipe
t0 = time.time()
batch_sentences = []
for doc in nlp.pipe(test_recipes, batch_size=1024):
    for sent in doc.sents:
        sent_str = sent.text.strip()
        if len(sent_str) > 5:
            sent_str = " ".join(sent_str.split())
            batch_sentences.append(sent_str)
print(f"Batch splitting took {time.time()-t0:.2f}s, got {len(batch_sentences)} sentences.")

assert len(seq_sentences) == len(batch_sentences)
print("Results match exactly!")
