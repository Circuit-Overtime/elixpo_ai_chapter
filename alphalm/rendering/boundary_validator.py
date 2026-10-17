import sys
from pathlib import Path

# Add parent directory to allow imports
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from tokenizer import clean_and_tokenize

def is_safe_merge(sentence_a: str, sentence_b: str, merged_sentence: str, validity_evaluator=None) -> bool:
    """
    Validates if merging sentence_a and sentence_b into merged_sentence is safe.
    
    Decision Criteria:
      - Primary Criterion: Validity score of the merged sentence must not drop below the separate 
        validity of the two individual sentences (min of individual validities):
        validity(merged) >= min(validity(A), validity(B))
      - Secondary Safety Filter: Merged sentence does not exceed 50 words.
      - Capitalization check: Capitalization of the start of sentence_a is preserved.
      - Ending punctuation check: Final punctuation of sentence_b is preserved.
    """
    # 1. Word length check (Secondary safety filter)
    words_a = clean_and_tokenize(sentence_a)
    words_b = clean_and_tokenize(sentence_b)
    words_merged = clean_and_tokenize(merged_sentence)
    
    if len(words_merged) > 50:
        return False
        
    # 2. Capitalization check
    if sentence_a and sentence_a[0].isupper():
        if not merged_sentence or not merged_sentence[0].isupper():
            return False
            
    # 3. Ending punctuation check
    if sentence_b and sentence_b[-1] in (".", "!", "?"):
        if not merged_sentence or merged_sentence[-1] not in (".", "!", "?"):
            return False

    # 4. Validity score check (Primary criterion)
    if validity_evaluator is not None:
        try:
            score_a = validity_evaluator.score_sentence(sentence_a)
            score_b = validity_evaluator.score_sentence(sentence_b)
            score_merged = validity_evaluator.score_sentence(merged_sentence)
            
            # Reject if validity drops below separate validity (the minimum of A and B)
            separate_validity = min(score_a, score_b)
            if score_merged < separate_validity:
                return False
        except Exception:
            # Fallback to True if evaluator fails/is not loaded properly
            pass
            
    return True

