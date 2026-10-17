import spacy
from typing import List
from config import SPACY_MODEL

# Load spaCy once and add sentencizer
# We disable parser and ner for speed, but keep tagger for keyword POS tagging later.
nlp = spacy.load(SPACY_MODEL, disable=["parser", "ner"])
nlp.max_length = 2500000
if "sentencizer" not in nlp.pipe_names:
    nlp.add_pipe("sentencizer")

def split_into_sentences(text: str) -> List[str]:
    """Splits the raw text corpus into cleaned sentence strings."""
    doc = nlp(text)
    sentences = []
    for sent in doc.sents:
        sent_str = sent.text.strip()
        # Filter out very short or empty sentences, chapter headings, etc.
        if len(sent_str) > 5:
            # Replace inner double spaces or carriage returns
            sent_str = " ".join(sent_str.split())
            sentences.append(sent_str)
    return sentences

_TOKEN_CACHE = {}

def clean_and_tokenize(sentence_text: str) -> List[str]:
    """
    Tokenizes a sentence string into a list of cleaned, lowercase words,
    excluding punctuation, spaces, and quotes.
    """
    if sentence_text not in _TOKEN_CACHE:
        doc = nlp(sentence_text)
        tokens = []
        for t in doc:
            if not t.is_space and not t.is_punct and not t.is_quote:
                word = t.text.lower().strip()
                if word:
                    tokens.append(word)
        _TOKEN_CACHE[sentence_text] = tokens
    return _TOKEN_CACHE[sentence_text]


def get_prefix(words: List[str], size: int) -> List[str]:
    """Returns the prefix (first 'size' words) of the word list."""
    return words[:size]

def get_suffix(words: List[str], size: int) -> List[str]:
    """Returns the suffix (last 'size' words) of the word list."""
    return words[-size:]
