import sys
import json
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec

# Add parent directory to path
SCRATCH_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRATCH_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from models.sentence_validity import SentenceValidityBiGRU, IndexedValidityDataset
from tokenizer import clean_and_tokenize, split_into_sentences
from loader import load_corpus

def evaluate():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Evaluating Sentence Validity Model on device: {device}")

    # Load Word2Vec model
    w2v_path = ROOT_DIR / "evaluator" / "evaluator_w2v.model"
    w2v = Word2Vec.load(str(w2v_path))

    # Extract bigrams
    sales_path = ROOT_DIR / "sales_dataset.txt"
    newton_path = ROOT_DIR / "newton_dataset.txt"
    sales_text = load_corpus(sales_path)
    newton_text = load_corpus(newton_path)
    corpus_sents = split_into_sentences(sales_text) + split_into_sentences(newton_text)
    
    corpus_bigrams = set()
    for sent in corpus_sents:
        tokens = clean_and_tokenize(sent)
        for i in range(len(tokens) - 1):
            corpus_bigrams.add((tokens[i], tokens[i+1]))
            
    print(f"Extracted {len(corpus_bigrams)} unique corpus bigrams.")

    # Datasets
    data_dir = ROOT_DIR / "models" / "validity_data"
    test_path = data_dir / "test.json"
    
    if not test_path.exists():
        print("Error: test dataset not found!")
        return

    # To reuse the class IndexedValidityDataset from train_validity, let's re-declare it or import it.
    # Actually, we can define it locally here.
    class LocalIndexedValidityDataset(Dataset):
        def __init__(self, data_path: Path, w2v_model: Word2Vec, corpus_bigrams: set, max_len: int = 30):
            with open(data_path, "r", encoding="utf-8") as f:
                self.samples = json.load(f)
            self.w2v = w2v_model
            self.corpus_bigrams = corpus_bigrams
            self.max_len = max_len
            
            self.samples_indices = []
            for sample in self.samples:
                indices, fraction = self._text_to_indices_and_fraction(sample["text"])
                label = float(sample["label"])
                self.samples_indices.append((indices, fraction, label))

        def _text_to_indices_and_fraction(self, sentence: str) -> tuple:
            tokens = clean_and_tokenize(sentence)
            indices = []
            for word in tokens:
                if word in self.w2v.wv:
                    indices.append(self.w2v.wv.key_to_index[word] + 2)
                else:
                    indices.append(1) # OOV
                    
            while len(indices) < self.max_len:
                indices.append(0)
                
            if len(indices) > self.max_len:
                indices = indices[:self.max_len]
                
            if len(tokens) < 2:
                fraction = 1.0
            else:
                unseen = 0
                for i in range(len(tokens) - 1):
                    bigram = (tokens[i], tokens[i+1])
                    if bigram not in self.corpus_bigrams:
                        unseen += 1
                fraction = 1.0 - (unseen / (len(tokens) - 1))
                
            return np.array(indices, dtype=np.int64), float(fraction)

        def __len__(self):
            return len(self.samples_indices)

        def __getitem__(self, idx):
            indices, fraction, label = self.samples_indices[idx]
            return (
                torch.tensor(indices, dtype=torch.long),
                torch.tensor([fraction], dtype=torch.float32),
                torch.tensor(label, dtype=torch.float32)
            )

    test_dataset = LocalIndexedValidityDataset(test_path, w2v, corpus_bigrams)
    test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)

    # Load best checkpoint
    model_path = ROOT_DIR / "models" / "sentence_validity.pt"
    if not model_path.exists():
        print(f"Error: model checkpoint {model_path} not found!")
        return

    model = SentenceValidityBiGRU(
        vocab_size=len(w2v.wv) + 2,
        word_dim=w2v.vector_size,
        gru_hidden=128,
        dropout=0.0
    )
    model.load_state_dict(torch.load(str(model_path), map_location=device, weights_only=True))
    model.to(device)
    model.eval()

    test_correct = 0
    test_total = 0
    with torch.no_grad():
        for batch_x, batch_f, batch_y in test_loader:
            batch_x = batch_x.to(device)
            batch_f = batch_f.to(device)
            batch_y = batch_y.to(device).unsqueeze(-1)
            outputs = model(batch_x, batch_f)
            preds = (outputs >= 0.5).float()
            test_correct += torch.sum(preds == batch_y).item()
            test_total += len(batch_x)
            
    test_acc = test_correct / test_total
    print(f"Test Set Size: {test_total}")
    print(f"Test Set Accuracy: {test_acc*100:.2f}%")

if __name__ == "__main__":
    evaluate()
