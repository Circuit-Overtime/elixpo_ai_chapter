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
SCRATCH_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRATCH_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from tokenizer import clean_and_tokenize, split_into_sentences
from loader import load_corpus
from utils import log_info, set_seed

class LateConcatValidityBiGRU(nn.Module):
    def __init__(self, vocab_size: int, word_dim: int = 100, gru_hidden: int = 64, dropout: float = 0.2, pretrained_weights=None, freeze_emb: bool = False):
        super().__init__()
        if pretrained_weights is not None:
            self.embedding = nn.Embedding.from_pretrained(
                torch.tensor(pretrained_weights, dtype=torch.float32),
                freeze=freeze_emb,
                padding_idx=0
            )
        else:
            self.embedding = nn.Embedding(vocab_size, word_dim, padding_idx=0)
            
        self.emb_dropout = nn.Dropout(dropout)
            
        self.gru = nn.GRU(
            input_size=word_dim,
            hidden_size=gru_hidden,
            num_layers=1,
            batch_first=True,
            bidirectional=True
        )
        
        self.gru_mlp = nn.Sequential(
            nn.Linear(gru_hidden * 2, 32),
            nn.ReLU(),
            nn.Dropout(dropout)
        )
        
        # Late concatenation: gru_mlp output (32) + fraction (1) = 33
        self.final_linear = nn.Linear(32 + 1, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor, fraction: torch.Tensor) -> torch.Tensor:
        embedded = self.embedding(x)
        embedded = self.emb_dropout(embedded)
        
        gru_out, _ = self.gru(embedded)
        sent_emb, _ = torch.max(gru_out, dim=1) # Global Max Pooling
        
        gru_feats = self.gru_mlp(sent_emb)
        
        combined = torch.cat((gru_feats, fraction), dim=1)
        out = self.sigmoid(self.final_linear(combined))
        return out

class IndexedValidityDataset(Dataset):
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

def train_and_eval(freeze_emb: bool):
    set_seed(root_config.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nTraining late-concat validity (freeze_emb={freeze_emb}) on device: {device}")

    w2v_path = ROOT_DIR / "evaluator" / "evaluator_w2v.model"
    w2v = Word2Vec.load(str(w2v_path))

    vocab_size = len(w2v.wv)
    pretrained_weights = np.zeros((vocab_size + 2, w2v.vector_size), dtype=np.float32)
    for word, idx in w2v.wv.key_to_index.items():
        pretrained_weights[idx + 2] = w2v.wv[word]

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
            
    data_dir = ROOT_DIR / "models" / "validity_data"
    train_dataset = IndexedValidityDataset(data_dir / "train.json", w2v, corpus_bigrams)
    val_dataset = IndexedValidityDataset(data_dir / "val.json", w2v, corpus_bigrams)
    test_dataset = IndexedValidityDataset(data_dir / "test.json", w2v, corpus_bigrams)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)
    test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)

    model = LateConcatValidityBiGRU(
        vocab_size=vocab_size + 2,
        word_dim=w2v.vector_size,
        gru_hidden=64,
        dropout=0.2,
        pretrained_weights=pretrained_weights,
        freeze_emb=freeze_emb
    ).to(device)
    
    criterion = nn.BCELoss()
    
    if freeze_emb:
        optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    else:
        # Fine-tune embeddings with a smaller learning rate
        optimizer = optim.AdamW([
            {"params": model.embedding.parameters(), "lr": 1e-4},
            {"params": model.gru.parameters(), "lr": 1e-3},
            {"params": model.gru_mlp.parameters(), "lr": 1e-3},
            {"params": model.final_linear.parameters(), "lr": 1e-3}
        ], weight_decay=1e-4)
    
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', factor=0.5, patience=2)

    epochs = 10
    best_val_acc = 0.0
    best_test_acc = 0.0

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
        
        # Test
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
        
        scheduler.step(val_acc)
        print(f"Epoch {epoch:02d} - Train Acc: {train_acc*100:.2f}% | Val Acc: {val_acc*100:.2f}% | Test Acc: {test_acc*100:.2f}%")
        
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_test_acc = test_acc

    print(f"Best Val Accuracy: {best_val_acc*100:.2f}%")
    print(f"Corresponding Test Accuracy: {best_test_acc*100:.2f}%")

if __name__ == "__main__":
    train_and_eval(freeze_emb=False)
    train_and_eval(freeze_emb=True)
