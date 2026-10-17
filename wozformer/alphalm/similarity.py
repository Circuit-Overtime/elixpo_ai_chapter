import numpy as np
from typing import List
from gensim.models import Word2Vec
from embeddings import get_mean_vector

def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """
    Computes the cosine similarity between two 1D numpy arrays.
    Returns 0.0 if either vector is a zero vector (norm is 0).
    """
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
        
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))

def compute_semantic_similarity(model: Word2Vec, words_a: List[str], words_b: List[str]) -> float:
    """
    Computes semantic similarity between two word lists by taking the cosine
    similarity of their mean Word2Vec vectors.
    """
    if not words_a or not words_b:
        return 0.0
    vec_a = get_mean_vector(model, words_a)
    vec_b = get_mean_vector(model, words_b)
    return cosine_similarity(vec_a, vec_b)
