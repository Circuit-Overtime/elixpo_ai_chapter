import sys
from pathlib import Path

# Add parent directory to allow imports
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from tokenizer import clean_and_tokenize
from rendering.boundary_validator import is_safe_merge

def strip_leading_overlap(sentence: str, m: int) -> str:
    """
    Strips the first m tokenized words from the textual representation of the sentence,
    preserving the rest of the string and capitalizing the new first character.
    """
    tokens = clean_and_tokenize(sentence)
    if len(tokens) < m:
        return sentence
        
    char_idx = 0
    for token in tokens[:m]:
        sub = sentence[char_idx:].lower()
        pos = sub.find(token.lower())
        if pos == -1:
            # Fallback: split by space and join remainder
            words = sentence.split()
            return " ".join(words[m:])
        char_idx += pos + len(token)
        
    rest = sentence[char_idx:].strip()
    while rest and not rest[0].isalnum():
        rest = rest[1:].strip()
        
    if rest:
        rest = rest[0].upper() + rest[1:]
    return rest

def stitch_text_v552(
    tokenized_sentences: list,
    match_scores: list,
    original_sentences: list,
    stitch_mode: str = "sentence_preserving",
    validity_evaluator=None
) -> str:
    """
    Stitches generated trajectory sentences together using the specified mode.
    
    Modes:
      - "legacy": Collapses overlapping words and omits sentence boundaries (v5.5 behavior).
      - "sentence_preserving": Joins sentences cleanly with period separators, preserving boundaries.
      - "smart": Merges duplicates only if overlap length <= 2, combined sentence remains valid,
                 and doesn't exceed 50 words. Otherwise falls back to sentence_preserving.
    """
    if not original_sentences:
        return ""
        
    if stitch_mode == "legacy":
        # Legacy Mode: collapse overlap directly, no sentence boundaries
        from quilter import stitch_text as legacy_stitch
        return legacy_stitch(tokenized_sentences, match_scores)
        
    # Initialize rendered segments list
    rendered_sentences = [original_sentences[0].strip()]
    
    for i in range(1, len(original_sentences)):
        sent_a_full = rendered_sentences[-1]
        sent_a_orig = original_sentences[i - 1].strip()
        sent_b_orig = original_sentences[i].strip()
        m = match_scores[i - 1]
        
        merged_successfully = False
        
        if stitch_mode == "smart" and 0 < m <= 2:
            stripped_b = strip_leading_overlap(sent_b_orig, m)
            if stripped_b:
                # Ensure sent_a_orig ends in punctuation for the validity check
                a_with_punct = sent_a_orig
                if not a_with_punct[-1] in (".", "!", "?"):
                    a_with_punct = a_with_punct + "."
                
                # Check candidate merge of the individual sentence pair (A and B)
                merged_candidate = a_with_punct + " " + stripped_b
                
                if is_safe_merge(sent_a_orig, sent_b_orig, merged_candidate, validity_evaluator):
                    # Apply merge to the full running string
                    if not sent_a_full[-1] in (".", "!", "?"):
                        sent_a_full = sent_a_full + "."
                    rendered_sentences[-1] = sent_a_full + " " + stripped_b
                    merged_successfully = True
                    
        if not merged_successfully:
            # Fallback to Sentence Preserving: join cleanly with standard punctuation
            if not sent_a_full[-1] in (".", "!", "?"):
                rendered_sentences[-1] = sent_a_full + "."
            rendered_sentences.append(sent_b_orig)
            
    # Final cleanup
    final_text = " ".join(rendered_sentences).strip()
    if final_text and not final_text[-1] in (".", "!", "?"):
        final_text += "."
        
    return final_text
