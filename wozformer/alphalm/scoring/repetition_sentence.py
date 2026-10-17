"""
AlphaLM v5.5.3 — Sentence Repetition Scorer
=============================================
Detects exact sentence duplicates in the current trajectory path.

Returns 1.0 if the candidate sentence is already present in the path history,
otherwise 0.0. Acts as a hard binary duplicate gate.
"""

from typing import List


def compute_sentence_repetition(candidate_text: str, history_texts: List[str]) -> float:
    """
    Computes the sentence-level repetition penalty for a candidate sentence.

    Args:
        candidate_text:  The raw text of the candidate sentence being evaluated.
        history_texts:   List of raw sentence texts already selected in the path.

    Returns:
        1.0 if the candidate is an exact duplicate of any history sentence.
        0.0 otherwise.
    """
    candidate_norm = candidate_text.strip().lower()
    for hist in history_texts:
        if hist.strip().lower() == candidate_norm:
            return 1.0
    return 0.0
