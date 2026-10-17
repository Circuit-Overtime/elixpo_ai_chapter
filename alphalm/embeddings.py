import numpy as np
from gensim.models import Word2Vec
from typing import List
import config
from utils import log_info

def train_word2vec(tokenized_sentences: List[List[str]]) -> Word2Vec:
    """
    Trains a Word2Vec model on the provided tokenized sentences.
    Uses hyperparameters specified in config.py.
    """
    log_info(f"Training Word2Vec model on {len(tokenized_sentences)} sentences...")
    model = Word2Vec(
        sentences=tokenized_sentences,
        vector_size=config.W2V_VECTOR_SIZE,
        window=config.W2V_WINDOW,
        min_count=config.W2V_MIN_COUNT,
        seed=config.SEED,
        workers=4
    )
    # Train the model
    model.train(
        tokenized_sentences,
        total_examples=len(tokenized_sentences),
        epochs=config.W2V_EPOCHS
    )
    log_info("Word2Vec training completed successfully.")
    return model

def get_word_vector(model: Word2Vec, word: str) -> np.ndarray:
    """
    Retrieves the embedding vector for a single word.
    Returns a zero vector of correct dimensions if the word is out of vocabulary (OOV).
    """
    if word in model.wv:
        return model.wv[word]
    return np.zeros(model.vector_size, dtype=np.float32)

def get_mean_vector(model: Word2Vec, words: List[str]) -> np.ndarray:
    """
    Computes the average vector of a list of words.
    If the list is empty or all words are OOV, returns a zero vector.
    """
    vectors = [model.wv[w] for w in words if w in model.wv]
    if not vectors:
        return np.zeros(model.vector_size, dtype=np.float32)
    return np.mean(vectors, axis=0)
