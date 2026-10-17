"""
AlphaLM v5.5.3 — Semantic Repetition Scorer
=============================================
Detects when a candidate sentence expresses the same idea as a previously
selected sentence using different words (paraphrase repetition).

Method:
  - Compute cosine similarity between candidate embedding and every
    embedding in the path history.
  - Penalty = max(0, max_cosine_sim - THRESHOLD), clamped to [0, 1].
  - Default THRESHOLD = 0.85 (only penalizes near-identical semantic content).

Example:
  "Trust is essential."     sim ≈ 0.91 with
  "Credibility is vital."   → penalty = max(0, 0.91 - 0.85) = 0.06
"""

import numpy as np
from typing import List

SEMANTIC_THRESHOLD = 0.85


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Computes cosine similarity between two vectors. Returns 0.0 for zero vectors."""
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a < 1e-9 or norm_b < 1e-9:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


def compute_semantic_repetition(
    candidate_vec: np.ndarray,
    history_vecs: List[np.ndarray],
    threshold: float = SEMANTIC_THRESHOLD
) -> float:
    """
    Computes the semantic repetition penalty for a candidate sentence.

    Args:
        candidate_vec:  Mean Word2Vec embedding of the candidate sentence.
        history_vecs:   List of mean embeddings for all previously selected sentences.
        threshold:      Similarity above which a penalty is applied (default 0.85).

    Returns:
        Penalty in [0.0, 1.0]. Zero when candidate is sufficiently novel.
        Increases linearly with max cosine similarity above the threshold.
    """
    if not history_vecs or np.linalg.norm(candidate_vec) < 1e-9:
        return 0.0

    max_sim = max(cosine_similarity(candidate_vec, hv) for hv in history_vecs)
    penalty = max(0.0, max_sim - threshold)
    return min(penalty, 1.0)
