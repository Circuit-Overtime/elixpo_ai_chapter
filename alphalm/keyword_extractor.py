from typing import List, Set
from tokenizer import nlp

# Content POS tags from reference v1.py
CONTENT_POS = {"NOUN", "PROPN", "VERB", "AUX", "ADJ", "ADV", "NUM"}

_KEYWORD_CACHE = {}

def extract_keywords(sentence_text: str) -> List[str]:
    """
    Extracts keywords from a sentence. Keywords are defined as words that are
    not stop words, not punctuation, and have a content part of speech (POS).
    Returns a list of lowercase lemmatized keywords.
    """
    if sentence_text not in _KEYWORD_CACHE:
        doc = nlp(sentence_text)
        keywords = []
        for t in doc:
            if not t.is_space and not t.is_punct and not t.is_quote:
                # Check if POS is content-carrying and word is not a stopword
                if t.pos_ in CONTENT_POS and not t.is_stop:
                    lemma = t.lemma_.lower().strip()
                    val = lemma if lemma else t.text.lower().strip()
                    if val:
                        keywords.append(val)
        _KEYWORD_CACHE[sentence_text] = keywords
    return _KEYWORD_CACHE[sentence_text]

def compute_keyword_jaccard(keywords_a: List[str], keywords_b: List[str]) -> float:
    """
    Computes the Jaccard similarity (overlap ratio) between two lists of keywords.
    Useful as a fallback or structural metric.
    """
    set_a: Set[str] = set(keywords_a)
    set_b: Set[str] = set(keywords_b)
    
    if not set_a or not set_b:
        return 0.0
        
    intersection = set_a.intersection(set_b)
    union = set_a.union(set_b)
    return len(intersection) / len(union)
