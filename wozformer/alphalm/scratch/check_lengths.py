import sys
from pathlib import Path
from gensim.models import Word2Vec

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(ROOT_DIR))

from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from models.sentence_validity_v2 import SentenceValidityEvaluatorV2

corpus_text = load_corpus(ROOT_DIR / "sales_dataset.txt")
sentences = split_into_sentences(corpus_text)
valid_sentences = [s for s in sentences if clean_and_tokenize(s)]

print(f"Total sentences: {len(valid_sentences)}")
lengths = [len(clean_and_tokenize(s)) for s in valid_sentences]
print(f"Max length: {max(lengths)}")
print(f"Min length: {min(lengths)}")
print(f"Avg length: {sum(lengths)/len(lengths):.2f}")

long_sents = [s for s in valid_sentences if len(clean_and_tokenize(s)) > 30]
print(f"Number of sentences with >30 tokens: {len(long_sents)}")

# Let's inspect the sentence:
# "Showing genuine interest in your customers needs and aspirations will go a long way in building rapport and trust and credibility are crucial factors in any purchasing decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision."
target_sent = "Showing genuine interest in your customers needs and aspirations will go a long way in building rapport and trust and credibility are crucial factors in any purchasing decision making authority objections in some cases prospects may claim that they lack the authority to make the final decision."

print("\nTarget Sentence:")
print(f"Exists in corpus: {target_sent in valid_sentences}")
if target_sent in valid_sentences:
    idx = valid_sentences.index(target_sent)
    print(f"Index in corpus: {idx}")
    print(f"Token length: {len(clean_and_tokenize(target_sent))}")
    
    # Load evaluator
    evaluator = SentenceValidityEvaluatorV2()
    score = evaluator.score_sentence(target_sent)
    print(f"Validity Score v2: {score:.4f}")
    
    from scoring.length_penalty import compute_length_penalty
    penalty = compute_length_penalty(len(clean_and_tokenize(target_sent)), score)
    print(f"Length Penalty: {penalty:.4f}")
