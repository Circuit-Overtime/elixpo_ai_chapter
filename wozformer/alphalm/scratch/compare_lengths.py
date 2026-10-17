import json
from pathlib import Path
import numpy as np

ROOT_DIR = Path(__file__).resolve().parent.parent

# Load JSONs from ablation_results_v5.5 and ablation_results_v5.5.1
v55_dir = ROOT_DIR / "ablation_results_v5.5"
v551_dir = ROOT_DIR / "ablation_results_v5.5.1"

seeds = [20, 40, 100, 200, 500]

print("Comparing Individual Sentence Lengths (Word Count) in Paths:\n")
print(f"{'Seed':<5} | {'v5.5 (Old)':<35} | {'v5.5.1 (New)':<35}")
print("-" * 82)

import sys
sys.path.append(str(ROOT_DIR))
from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize

corpus_text = load_corpus(ROOT_DIR / "sales_dataset.txt")
sentences = split_into_sentences(corpus_text)
valid_sentences = [s for s in sentences if clean_and_tokenize(s)]

v55_total_words = []
v551_total_words = []

for seed in seeds:
    # Load v5.5 path
    v55_file = v55_dir / f"Condition_D_Full_Ensemble_seed_{seed}.json"
    if not v55_file.exists():
        # fallback
        v55_file = v55_dir / f"v5.5_seed_{seed}.json" # if named differently
    if not v55_file.exists():
        # try search in the directory
        files = list(v55_dir.glob(f"*seed_{seed}.json"))
        if files:
            v55_file = files[0]
            
    with open(v55_file, "r", encoding="utf-8") as f:
        v55_data = json.load(f)
    v55_indices = v55_data["path_indices"]
    v55_lens = [len(clean_and_tokenize(valid_sentences[idx])) for idx in v55_indices]
    
    # Load v5.5.1 path
    v551_file = v551_dir / f"v5.5.1_seed_{seed}.json"
    with open(v551_file, "r", encoding="utf-8") as f:
        v551_data = json.load(f)
    v551_indices = v551_data["path_indices"]
    v551_lens = [len(clean_and_tokenize(valid_sentences[idx])) for idx in v551_indices]
    
    v55_total_words.extend(v55_lens)
    v551_total_words.extend(v551_lens)
    
    v55_str = f"Avg: {np.mean(v55_lens):.1f} Max: {max(v55_lens)} {v55_lens}"
    v551_str = f"Avg: {np.mean(v551_lens):.1f} Max: {max(v551_lens)} {v551_lens}"
    print(f"{seed:<5} | {v55_str:<35} | {v551_str:<35}")

print("-" * 82)
print(f"Overall Average Sentence Length:")
print(f"  v5.5 (Old):   {np.mean(v55_total_words):.2f} words")
print(f"  v5.5.1 (New): {np.mean(v551_total_words):.2f} words")
print(f"Overall Max Sentence Length:")
print(f"  v5.5 (Old):   {max(v55_total_words)} words")
print(f"  v5.5.1 (New): {max(v551_total_words)} words")
