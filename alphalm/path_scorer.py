from typing import List
from gensim.models import Word2Vec
from embeddings import get_mean_vector
from similarity import cosine_similarity

def compute_local_coherence(model: Word2Vec, current_words: List[str], candidate_words: List[str]) -> float:
    """
    Computes local coherence (sentence-to-sentence similarity) using Word2Vec.
    Returns cosine similarity between the mean word embedding of the two sentences.
    """
    if not current_words or not candidate_words:
        return 0.0
    vec_curr = get_mean_vector(model, current_words)
    vec_cand = get_mean_vector(model, candidate_words)
    return cosine_similarity(vec_curr, vec_cand)

def compute_global_coherence(model: Word2Vec, history_sent_words: List[List[str]], candidate_words: List[str], window_size: int) -> float:
    """
    Computes global coherence (thematic continuity over a sliding context window of sentences).
    1. Pools all tokenized words from the last 'window_size' sentences in history.
    2. Computes the average embedding vector of this pooled window.
    3. Computes the average embedding vector of the candidate sentence words.
    4. Returns the cosine similarity between the two mean vectors.
    
    Prevents local coherence from causing gradual topic drift.
    """
    if not history_sent_words or not candidate_words:
        return 0.0
        
    # Slice the last 'window_size' sentences of words from history
    recent_history = history_sent_words[-window_size:]
    # Flatten the list of sentences into a single list of words
    pooled_words = [word for sent in recent_history for word in sent]
    
    if not pooled_words:
        return 0.0
        
    vec_hist = get_mean_vector(model, pooled_words)
    vec_cand = get_mean_vector(model, candidate_words)
    return cosine_similarity(vec_hist, vec_cand)
