import sys
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec

# Add parent directory to path
TRAINING_DIR = Path(__file__).resolve().parent
ROOT_DIR = TRAINING_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from models.sentence_validity_v2 import SentenceValidityBiGRUV2
from tokenizer import clean_and_tokenize
from loader import load_corpus
from tokenizer import split_into_sentences
from scoring.validity_features import extract_validity_features
from utils import log_info, set_seed

class IndexedValidityDatasetV2(Dataset):
    def __init__(self, data_path: Path, w2v_model: Word2Vec, corpus_bigrams: set, max_len: int = 30):
        with open(data_path, "r", encoding="utf-8") as f:
            self.samples = json.load(f)
        self.w2v = w2v_model
        self.corpus_bigrams = corpus_bigrams
        self.max_len = max_len
        
        # Pre-convert to indices and scalar features to speed up training epoch loops
        self.samples_indices = []
        log_info(f"Processing {len(self.samples)} samples from {data_path.name}...")
        for sample in self.samples:
            indices, scalar_vec = self._text_to_indices_and_features(sample["text"])
            label = float(sample["label"])
            self.samples_indices.append((indices, scalar_vec, label))

    def _text_to_indices_and_features(self, sentence: str) -> tuple:
        tokens = clean_and_tokenize(sentence)
        indices = []
        for word in tokens:
            if word in self.w2v.wv:
                indices.append(self.w2v.wv.key_to_index[word] + 2)
            else:
                indices.append(1) # OOV index
                
        while len(indices) < self.max_len:
            indices.append(0) # Padding
            
        if len(indices) > self.max_len:
            indices = indices[:self.max_len]
            
        # Extract features
        feats_dict = extract_validity_features(sentence, self.corpus_bigrams)
        scalar_vec = [
            feats_dict["length_char"],
            feats_dict["num_tokens"],
            feats_dict["punctuation_count"],
            feats_dict["unique_token_ratio"],
            feats_dict["repeated_bigram_count"],
            feats_dict["seen_bigram_fraction"],
            feats_dict["is_perfect_bigram"]
        ]
            
        return np.array(indices, dtype=np.int64), np.array(scalar_vec, dtype=np.float32)

    def __len__(self):
        return len(self.samples_indices)

    def __getitem__(self, idx):
        indices, scalar_vec, label = self.samples_indices[idx]
        return (
            torch.tensor(indices, dtype=torch.long),
            torch.tensor(scalar_vec, dtype=torch.float32),
            torch.tensor(label, dtype=torch.float32)
        )

def train_validity():
    set_seed(root_config.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log_info(f"Training Sentence Validity BiGRU on device: {device}")

    # Load Word2Vec model
    w2v_path = ROOT_DIR / "models" / "recipes_word2vec.model"
    w2v = Word2Vec.load(str(w2v_path))

    # Construct pretrained embedding matrix
    vocab_size = len(w2v.wv)
    pretrained_weights = np.zeros((vocab_size + 2, w2v.vector_size), dtype=np.float32)
    for word, idx in w2v.wv.key_to_index.items():
        pretrained_weights[idx + 2] = w2v.wv[word]

    # Load entire recipes corpus to build bigrams
    log_info("Loading recipes corpus for seen-bigram extraction...")
    recipes_path = ROOT_DIR / "recipes_5m.txt"
    recipes_text = load_corpus(recipes_path)
    recipes_raw = recipes_text.split("<|endoftext|>")
    corpus_sents = []
    for r in recipes_raw:
        if r.strip():
            corpus_sents.extend(split_into_sentences(r))
    
    corpus_bigrams = set()
    for sent in corpus_sents:
        tokens = clean_and_tokenize(sent)
        for i in range(len(tokens) - 1):
            corpus_bigrams.add((tokens[i], tokens[i+1]))
            
    log_info(f"Extracted {len(corpus_bigrams)} unique corpus bigrams.")

    # Datasets
    data_dir = ROOT_DIR / "models" / "validity_recipes_data"
    train_dataset = IndexedValidityDatasetV2(data_dir / "train.json", w2v, corpus_bigrams)
    val_dataset = IndexedValidityDatasetV2(data_dir / "val.json", w2v, corpus_bigrams)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)

    model = SentenceValidityBiGRUV2(
        vocab_size=vocab_size + 2,
        word_dim=w2v.vector_size,
        gru_hidden=64,
        dropout=0.2,
        pretrained_weights=pretrained_weights,
        freeze_emb=False,
        num_scalar_features=7
    ).to(device)
    
    criterion = nn.BCELoss()
    
    optimizer = optim.AdamW([
        {"params": model.embedding.parameters(), "lr": 1e-4},
        {"params": model.gru.parameters(), "lr": 1e-3},
        {"params": model.gru_mlp.parameters(), "lr": 1e-3},
        {"params": model.final_linear.parameters(), "lr": 1e-3}
    ], weight_decay=1e-4)
    
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', factor=0.5, patience=2)

    epochs = 15
    best_val_acc = 0.0
    best_model_path = ROOT_DIR / "models" / "validity_recipes_bigru.pt"
    best_model_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        for batch_x, batch_f, batch_y in train_loader:
            batch_x = batch_x.to(device)
            batch_f = batch_f.to(device)
            batch_y = batch_y.to(device).unsqueeze(-1)
            
            optimizer.zero_grad()
            
            outputs = model(batch_x, batch_f)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item() * len(batch_x)
            
            preds = (outputs >= 0.5).float()
            train_correct += torch.sum(preds == batch_y).item()
            train_total += len(batch_x)
            
        train_avg_loss = train_loss / train_total
        train_acc = train_correct / train_total
        
        # Validation
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0
        
        with torch.no_grad():
            for batch_x, batch_f, batch_y in val_loader:
                batch_x = batch_x.to(device)
                batch_f = batch_f.to(device)
                batch_y = batch_y.to(device).unsqueeze(-1)
                
                outputs = model(batch_x, batch_f)
                loss = criterion(outputs, batch_y)
                
                val_loss += loss.item() * len(batch_x)
                preds = (outputs >= 0.5).float()
                val_correct += torch.sum(preds == batch_y).item()
                val_total += len(batch_x)
                
        val_avg_loss = val_loss / val_total
        val_acc = val_correct / val_total
        
        scheduler.step(val_acc)
        
        log_info(f"Epoch {epoch:02d}/{epochs} - Train Loss: {train_avg_loss:.4f}, Train Acc: {train_acc*100:.2f}% | Val Loss: {val_avg_loss:.4f}, Val Acc: {val_acc*100:.2f}%")
        
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), str(best_model_path))
            log_info(f"  --> Saved new best checkpoint to {best_model_path.name} (Val Acc: {best_val_acc*100:.2f}%)")

    # Evaluate on test set
    test_path = data_dir / "test.json"
    if test_path.exists():
        test_dataset = IndexedValidityDatasetV2(test_path, w2v, corpus_bigrams)
        test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)
        model.load_state_dict(torch.load(str(best_model_path)))
        model.eval()
        
        test_correct = 0
        test_total = 0
        y_true = []
        y_pred = []
        y_scores = []
        
        with torch.no_grad():
            for batch_x, batch_f, batch_y in test_loader:
                batch_x = batch_x.to(device)
                batch_f = batch_f.to(device)
                batch_y = batch_y.to(device).unsqueeze(-1)
                outputs = model(batch_x, batch_f)
                preds = (outputs >= 0.5).float()
                
                test_correct += torch.sum(preds == batch_y).item()
                test_total += len(batch_x)
                
                y_true.extend(batch_y.view(-1).cpu().numpy().tolist())
                y_pred.extend(preds.view(-1).cpu().numpy().tolist())
                y_scores.extend(outputs.view(-1).cpu().numpy().tolist())
                
        test_acc = test_correct / test_total
        
        # Calculate precision, recall, F1, and AUC
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1.0 and p == 1.0)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0.0 and p == 1.0)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1.0 and p == 0.0)
        tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0.0 and p == 0.0)
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        
        pos_scores = [s for t, s in zip(y_true, y_scores) if t == 1.0]
        neg_scores = [s for t, s in zip(y_true, y_scores) if t == 0.0]
        
        auc = 0.0
        if pos_scores and neg_scores:
            ranking_wins = 0
            for ps in pos_scores:
                for ns in neg_scores:
                    if ps > ns:
                        ranking_wins += 1
                    elif ps == ns:
                        ranking_wins += 0.5
            auc = ranking_wins / (len(pos_scores) * len(neg_scores))
            
        print("\n--- Recipe Validity BiGRU Test Metrics ---")
        print(f"Accuracy:  {test_acc*100:.2f}%")
        print(f"Precision: {precision*100:.2f}%")
        print(f"Recall:    {recall*100:.2f}%")
        print(f"F1 Score:  {f1:.4f}")
        print(f"ROC AUC:   {auc:.4f}")
        
        # Save metrics
        metrics_dict = {
            "accuracy": test_acc,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "auc": auc
        }
        with open(ROOT_DIR / "models" / "validity_recipes_metrics.json", "w") as f:
            json.dump(metrics_dict, f, indent=2)

if __name__ == "__main__":
    train_validity()
