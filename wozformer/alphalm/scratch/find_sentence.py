import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT_DIR))

from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize

corpus_text = load_corpus(ROOT_DIR / "sales_dataset.txt")
sentences = split_into_sentences(corpus_text)
valid_sentences = [s for s in sentences if clean_and_tokenize(s)]

target = "Showing genuine interest in your customers needs and aspirations will go a long way in building rapport and trust and credibility are crucial factors in any purchasing decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision."

print("Searching for matches...")
for s in valid_sentences:
    if s in target or target in s:
        print(f"Match: {s}")
    elif "Showing genuine interest" in s:
        print(f"Partial Match (Showing...): {s}")
    elif "making authority objections" in s:
        print(f"Partial Match (making...): {s}")
    elif "lack the authority to make the final decision" in s:
        print(f"Partial Match (lack...): {s}")
