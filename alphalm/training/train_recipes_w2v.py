import sys
from pathlib import Path
from gensim.models import Word2Vec
import multiprocessing

# Add parent directory to path
TRAINING_DIR = Path(__file__).resolve().parent
ROOT_DIR = TRAINING_DIR.parent
sys.path.append(str(ROOT_DIR))

from loader import load_corpus
from tokenizer import split_into_sentences, clean_and_tokenize
from utils import log_info, set_seed
import config as root_config

def train_recipes_w2v():
    set_seed(root_config.SEED)
    
    corpus_path = ROOT_DIR / "recipes_5m.txt"
    model_save_path = ROOT_DIR / "models" / "recipes_word2vec.model"
    model_save_path.parent.mkdir(parents=True, exist_ok=True)
    
    log_info(f"Loading recipe corpus from {corpus_path.name}...")
    corpus_text = load_corpus(corpus_path)
    
    log_info("Splitting corpus into recipes and sentences...")
    recipes = corpus_text.split("<|endoftext|>")
    sentences = []
    for r in recipes:
        if r.strip():
            sentences.extend(split_into_sentences(r))
            
    log_info("Tokenizing sentences...")
    tokenized_sentences = [clean_and_tokenize(s) for s in sentences]
    # Filter empty token lists
    tokenized_sentences = [toks for toks in tokenized_sentences if toks]
    
    log_info(f"Tokenized {len(tokenized_sentences)} sentences.")
    log_info("Training Word2Vec model on recipes 5M subset...")
    
    # Configure parameters
    # vector_size = 128 (matches hidden dim of Makes-Sense and Validity Transformer/BiGRU models)
    model = Word2Vec(
        sentences=tokenized_sentences,
        vector_size=128,
        window=5,
        min_count=1,
        seed=root_config.SEED,
        workers=multiprocessing.cpu_count()
    )
    
    model.train(
        tokenized_sentences,
        total_examples=len(tokenized_sentences),
        epochs=20
    )
    
    model.save(str(model_save_path))
    log_info(f"Word2Vec model successfully trained and saved to {model_save_path}")
    log_info(f"Vocab size: {len(model.wv)}")
    
if __name__ == "__main__":
    train_recipes_w2v()
