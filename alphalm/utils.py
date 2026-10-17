import random
import numpy as np

def set_seed(seed: int) -> None:
    """Sets random seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)

def log_info(msg: str) -> None:
    """Standard logging helper for information messages."""
    print(f"[INFO] {msg}")

def log_debug(msg: str) -> None:
    """Standard logging helper for detailed debugging information."""
    print(f"[DEBUG] {msg}")

def log_decision(step: int, selected: str, index: int, reason: str, score: tuple) -> None:
    """Formated logger for text-quilting choices."""
    exact, sem, kw = score
    print(f"[STEP {step}] Selected sentence {index}: \"{selected[:60]}...\"")
    print(f"         Scores -> Exact Boundary Match: {exact}, Word2Vec Boundary Similarity: {sem:.4f}, Keyword Similarity: {kw:.4f}")
    print(f"         Reason -> {reason}\n")
