import sys
import json
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec
import spacy
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

# Add parent directory to path
SCRATCH_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRATCH_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from tokenizer import clean_and_tokenize
from similarity import cosine_similarity

# Initialize spaCy
nlp = spacy.load("en_core_web_sm", disable=["parser", "ner"])

def extract_features(text: str, w2v: Word2Vec) -> np.ndarray:
    tokens = clean_and_tokenize(text)
    
    # Feature 1: Length
    length = len(tokens)
    
    # Semantic similarity of adjacent words
    sims = []
    for i in range(len(tokens) - 1):
        w1 = tokens[i]
        w2 = tokens[i+1]
        if w1 in w2v.wv and w2 in w2v.wv:
            sims.append(cosine_similarity(w2v.wv[w1], w2v.wv[w2]))
        else:
            sims.append(0.0)
            
    if not sims:
        mean_sim = 0.0
        min_sim = 0.0
        max_sim = 0.0
        std_sim = 0.0
    else:
        mean_sim = np.mean(sims)
        min_sim = np.min(sims)
        max_sim = np.max(sims)
        std_sim = np.std(sims)
        
    # POS tag counts
    doc = nlp(text)
    pos_counts = {
        'NOUN': 0, 'VERB': 0, 'ADJ': 0, 'ADV': 0, 'DET': 0, 'PRON': 0, 'ADP': 0, 'CCONJ': 0
    }
    for t in doc:
        if t.pos_ in pos_counts:
            pos_counts[t.pos_] += 1
            
    pos_features = [pos_counts[k] / (len(doc) + 1e-5) for k in sorted(pos_counts.keys())]
    
    features = [
        length,
        mean_sim,
        min_sim,
        max_sim,
        std_sim,
    ] + pos_features
    
    return np.array(features, dtype=np.float32)

def main():
    w2v_path = ROOT_DIR / "evaluator" / "evaluator_w2v.model"
    w2v = Word2Vec.load(str(w2v_path))
    
    data_dir = ROOT_DIR / "models" / "validity_data"
    
    # Load json splits
    with open(data_dir / "train.json", "r", encoding="utf-8") as f:
        train_samples = json.load(f)
    with open(data_dir / "val.json", "r", encoding="utf-8") as f:
        val_samples = json.load(f)
    with open(data_dir / "test.json", "r", encoding="utf-8") as f:
        test_samples = json.load(f)
        
    print(f"Extracting features for {len(train_samples)} train samples...")
    X_train = np.array([extract_features(s["text"], w2v) for s in train_samples])
    y_train = np.array([s["label"] for s in train_samples])
    
    print(f"Extracting features for {len(test_samples)} test samples...")
    X_test = np.array([extract_features(s["text"], w2v) for s in test_samples])
    y_test = np.array([s["label"] for s in test_samples])
    
    # Train Random Forest
    rf = RandomForestClassifier(n_estimators=100, random_state=42)
    rf.fit(X_train, y_train)
    
    preds = rf.predict(X_test)
    acc = accuracy_score(y_test, preds)
    print(f"Random Forest Accuracy on Test Set: {acc*100:.2f}%")

if __name__ == "__main__":
    main()
