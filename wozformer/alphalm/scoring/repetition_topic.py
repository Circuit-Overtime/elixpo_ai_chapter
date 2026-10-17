"""
AlphaLM v5.5.3 — Topic Repetition Scorer
==========================================
Detects when the candidate sentence returns to the overall topic already
explored in the trajectory, even if individual pairwise similarity is low.

Method:
  - topic_memory = running mean embedding of ALL previously selected sentences.
  - topic_similarity = cosine(candidate_vec, topic_memory).
  - Penalty = max(0, topic_similarity - THRESHOLD), clamped to [0, 1].
  - Default THRESHOLD = 0.75.

This is the most important component: it discourages the search from
orbiting a single topic cluster (e.g. Trust → Trust → Trust)
and instead rewards forward motion into new semantic territory.

Example trajectory:
  Good:  Trust → Objections → Product Knowledge → Closing
  Bad:   Trust → Credibility → Trust → Rapport → Trust
"""

import numpy as np

TOPIC_THRESHOLD = 0.75


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """Computes cosine similarity between two vectors. Returns 0.0 for zero vectors."""
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a < 1e-9 or norm_b < 1e-9:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


def compute_topic_repetition(
    candidate_vec: np.ndarray,
    topic_memory_vec: np.ndarray,
    threshold: float = TOPIC_THRESHOLD
) -> float:
    """
    Computes the topic-level repetition penalty for a candidate sentence.

    Args:
        candidate_vec:    Mean Word2Vec embedding of the candidate sentence.
        topic_memory_vec: Running mean embedding of all previously visited sentences.
        threshold:        Similarity above which a penalty is applied (default 0.75).

    Returns:
        Penalty in [0.0, 1.0]. Zero when candidate diverges from current topic.
        Increases as candidate aligns more strongly with the accumulated topic memory.
    """
    if np.linalg.norm(topic_memory_vec) < 1e-9 or np.linalg.norm(candidate_vec) < 1e-9:
        return 0.0

    sim = cosine_similarity(candidate_vec, topic_memory_vec)
    penalty = max(0.0, sim - threshold)
    return min(penalty, 1.0)
