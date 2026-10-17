import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT_DIR))

from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize

corpus_text = load_corpus(ROOT_DIR / "sales_dataset.txt")
sentences = split_into_sentences(corpus_text)
valid_sentences = [s for s in sentences if clean_and_tokenize(s)]

indices = [20, 27, 49, 131, 230, 281, 107, 108]
print("Sentences in Path:")
for idx in indices:
    print(f"[{idx}]: {valid_sentences[idx]} (len: {len(clean_and_tokenize(valid_sentences[idx]))})")
