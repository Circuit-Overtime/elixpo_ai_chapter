import sys
from pathlib import Path
from typing import Dict, List

# Add parent directory to path to allow imports
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from tokenizer import clean_and_tokenize

def extract_validity_features(sentence: str, corpus_bigrams: set) -> Dict[str, float]:
    """
    Extracts 7 statistical and syntactic features from a sentence.
    
    1. length_char: sentence string character length
    2. num_tokens: number of words/tokens in the sentence
    3. punctuation_count: total punctuation characters in the raw string
    4. unique_token_ratio: unique tokens divided by total tokens
    5. repeated_bigram_count: count of bigrams appearing more than once
    6. seen_bigram_fraction: fraction of word-bigrams that exist in the corpus
    7. is_perfect_bigram: binary indicator if seen_bigram_fraction >= 0.999
    """
    tokens = clean_and_tokenize(sentence)
    num_tokens = len(tokens)
    length_char = len(sentence)
    
    # Punctuation count
    puncts = ",;.!?-\"'"
    punctuation_count = sum(1 for c in sentence if c in puncts)
    
    # Unique token ratio
    unique_tokens = set(tokens)
    unique_token_ratio = len(unique_tokens) / (num_tokens + 1e-5) if num_tokens > 0 else 1.0
    
    # Extract bigrams
    bigrams = []
    for i in range(num_tokens - 1):
        bigrams.append((tokens[i], tokens[i+1]))
        
    # Repeated bigram count
    bigram_counts = {}
    for bg in bigrams:
        bigram_counts[bg] = bigram_counts.get(bg, 0) + 1
    repeated_bigram_count = sum(1 for bg, count in bigram_counts.items() if count > 1)
    
    # Seen-bigram fraction
    if num_tokens < 2:
        seen_bigram_fraction = 1.0
    else:
        unseen = 0
        for bg in bigrams:
            if bg not in corpus_bigrams:
                unseen += 1
        seen_bigram_fraction = 1.0 - (unseen / (num_tokens - 1))
        
    is_perfect_bigram = 1.0 if seen_bigram_fraction >= 0.999 else 0.0
    
    return {
        "length_char": float(length_char),
        "num_tokens": float(num_tokens),
        "punctuation_count": float(punctuation_count),
        "unique_token_ratio": float(unique_token_ratio),
        "repeated_bigram_count": float(repeated_bigram_count),
        "seen_bigram_fraction": float(seen_bigram_fraction),
        "is_perfect_bigram": float(is_perfect_bigram)
    }
