import os
from pathlib import Path
from utils import log_info

def load_corpus(filepath: Path) -> str:
    """
    Loads and performs basic cleaning of the input text corpus.
    Reads using UTF-8 with fallback error handling to ignore decoding issues.
    """
    if not filepath.exists():
        raise FileNotFoundError(f"Corpus file not found at: {filepath}")

    log_info(f"Loading corpus from: {filepath}")
    
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()

    # Clean basic layout issues (e.g. carriage returns)
    text = text.replace("\r\n", "\n")
    cleaned_text = text.strip()
    
    log_info(f"Loaded {len(cleaned_text)} characters from corpus.")
    return cleaned_text
