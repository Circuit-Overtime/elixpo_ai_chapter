"""
AlphaLM v5.5.3 — Topic Progress Bonus Scorer
==============================================
Rewards the search for entering a semantic region not previously explored.
Complements the repetition penalties with a positive exploration signal.

Method:
  - visited_vecs: list of mean embeddings for all previously selected sentences.
  - bonus = 1.0 - max_cosine_similarity(candidate_vec, visited_vecs)
  - Range: [0.0, 1.0].
  - High bonus (near 1.0) when candidate is in a completely novel region.
  - Zero bonus when the candidate is very close to a previously visited sentence.

This bonus is ADDED (not subtracted) to the score, weighted by w_progress.

Example:
  After: Trust, Credibility, Rapport
  Candidate: "Closing Strategy" → bonus ≈ 0.72  (novel region, reward it)
  Candidate: "Building Trust"   → bonus ≈ 0.05  (revisit, barely rewarded)
"""

import numpy as np
from typing import List


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Computes cosine similarity between two vectors. Returns 0.0 for zero vectors."""
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a < 1e-9 or norm_b < 1e-9:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


def compute_topic_progress(
    candidate_vec: np.ndarray,
    visited_vecs: List[np.ndarray]
) -> float:
    """
    Computes the topic progress bonus for a candidate sentence.

    Args:
        candidate_vec:  Mean Word2Vec embedding of the candidate sentence.
        visited_vecs:   List of mean embeddings for all previously selected sentences.

    Returns:
        Bonus in [0.0, 1.0]. High when the candidate occupies a novel semantic region.
        Low when the candidate's region has already been explored.
    """
    if not visited_vecs or np.linalg.norm(candidate_vec) < 1e-9:
        # First step or zero vector: maximum novelty
        return 1.0

    max_sim = max(cosine_similarity(candidate_vec, vv) for vv in visited_vecs)
    bonus = 1.0 - max_sim
    return max(0.0, min(bonus, 1.0))
