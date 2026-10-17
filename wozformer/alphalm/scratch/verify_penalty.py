import sys
from pathlib import Path
import torch
import numpy as np

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from tokenizer import clean_and_tokenize
from models.sentence_validity_v2 import SentenceValidityEvaluatorV2
from scoring.length_penalty import compute_length_penalty

# Let's inspect length penalty calculations for various word lengths and validity scores
test_cases = [
    # (num_words, validity_score)
    (15, 0.9),  # short, high validity
    (15, 0.3),  # short, low validity
    (35, 0.9),  # medium, high validity
    (35, 0.5),  # medium, moderate validity
    (35, 0.3),  # medium, low validity
    (50, 0.9),  # long, high validity
    (50, 0.5),  # long, moderate validity
    (50, 0.3),  # long, low validity
    (70, 0.9),  # very long, high validity
    (70, 0.3),  # very long, low validity
]

print("Length Penalty Test Cases:")
print(f"{'Words':<6} | {'Validity':<8} | {'Penalty':<8}")
print("-" * 32)
for nw, val in test_cases:
    penalty = compute_length_penalty(nw, val)
    print(f"{nw:<6} | {val:<8.2f} | {penalty:<8.4f}")

# Verify that search.py correctly applies it
print("\nVerifying integration logic from search.py:")
# Let's simulate a candidate sentence of 50 words with validity 0.3:
nw = 50
val = 0.3
penalty = compute_length_penalty(nw, val)
validity_penalty = 0.0
if val < 0.4:
    # low validity gate penalty:
    validity_penalty += -2.0 * (0.4 - val) / 0.4
validity_penalty += penalty

print(f"Candidate: {nw} words, validity {val:.2f}")
print(f"Low-validity gate penalty: {-2.0 * (0.4 - val) / 0.4:.4f}")
print(f"Length penalty: {penalty:.4f}")
print(f"Total validity penalty: {validity_penalty:.4f}")
print(f"Adjusted validity score contribution: {val + validity_penalty:.4f}")
