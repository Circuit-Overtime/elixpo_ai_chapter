from typing import List, Tuple
from gensim.models import Word2Vec
from similarity import compute_semantic_similarity
from keyword_extractor import compute_keyword_jaccard

def get_exact_match_score(suffix: List[str], prefix: List[str]) -> int:
    """
    Finds the maximum overlap where the end of the suffix matches the start of the prefix.
    Returns the length of the matching overlap (0 if no match).
    """
    max_len = min(len(suffix), len(prefix))
    for m in range(max_len, 0, -1):
        if suffix[-m:] == prefix[:m]:
            return m
    return 0

def score_candidate(
    model: Word2Vec,
    current_suffix: List[str],
    current_keywords: List[str],
    candidate_prefix: List[str],
    candidate_keywords: List[str]
) -> Tuple[int, float, float]:
    """
    Generates a score tuple for a candidate sentence.
    Priority structure:
      1. Exact match score (integer length of exact boundary overlap)
      2. Semantic boundary similarity (Word2Vec cosine similarity between boundary suffixes/prefixes)
      3. Keyword similarity (Word2Vec similarity of content keywords, with Jaccard overlap as a secondary booster/tie-breaker)
    Returns:
      A tuple (exact_match, semantic_similarity, keyword_similarity)
    """
    # 1. Exact boundary match
    exact_score = get_exact_match_score(current_suffix, candidate_prefix)
    
    # 2. Semantic boundary similarity (Word2Vec similarity)
    # If exact match exists, we can still compute it, but lexicographical sorting prioritizes exact_score first.
    sem_score = compute_semantic_similarity(model, current_suffix, candidate_prefix)
    
    # 3. Keyword similarity (tie-breaker)
    # Word2Vec similarity between keyword lists
    kw_sem = compute_semantic_similarity(model, current_keywords, candidate_keywords)
    # Plus a small Jaccard score to break exact zero-vector ties if necessary
    kw_jac = compute_keyword_jaccard(current_keywords, candidate_keywords)
    kw_score = kw_sem + 0.01 * kw_jac
    
    return exact_score, sem_score, kw_score
