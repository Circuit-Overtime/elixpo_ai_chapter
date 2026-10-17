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
from utils import log_info, set_seed
from tokenizer import clean_and_tokenize

class SentenceValidityBiGRU(nn.Module):
    def __init__(self, vocab_size: int, word_dim: int = 100, gru_hidden: int = 128, dropout: float = 0.2, pretrained_weights=None):
        super().__init__()
        if pretrained_weights is not None:
            self.embedding = nn.Embedding.from_pretrained(
                torch.tensor(pretrained_weights, dtype=torch.float32),
                freeze=False,
                padding_idx=0
            )
        else:
            self.embedding = nn.Embedding(vocab_size, word_dim, padding_idx=0)
            
        self.gru = nn.GRU(
            input_size=word_dim,
            hidden_size=gru_hidden,
            num_layers=1,
            batch_first=True,
            bidirectional=True
        )
        self.mlp = nn.Sequential(
            nn.Linear(gru_hidden * 2, 128),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(128, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        embedded = self.embedding(x) # [batch_size, seq_len, word_dim]
        gru_out, _ = self.gru(embedded)
        sent_emb, _ = torch.max(gru_out, dim=1)
        return self.mlp(sent_emb)

class IndexedValidityDataset(Dataset):
    def __init__(self, data_path: Path, w2v_model: Word2Vec, max_len: int = 30):
        with open(data_path, "r", encoding="utf-8") as f:
            self.samples = json.load(f)
        self.w2v = w2v_model
        self.max_len = max_len
        
        self.samples_indices = []
        for sample in self.samples:
            indices = self._text_to_indices(sample["text"])
            label = float(sample["label"])
            self.samples_indices.append((indices, label))

    def _text_to_indices(self, sentence: str) -> np.ndarray:
        tokens = clean_and_tokenize(sentence)
        indices = []
        for word in tokens:
            if word in self.w2v.wv:
                indices.append(self.w2v.wv.key_to_index[word] + 2)
            else:
                indices.append(1)
                
        while len(indices) < self.max_len:
            indices.append(0)
            
        if len(indices) > self.max_len:
            indices = indices[:self.max_len]
            
        return np.array(indices, dtype=np.int64)

    def __len__(self):
        return len(self.samples_indices)

    def __getitem__(self, idx):
        indices, label = self.samples_indices[idx]
        return torch.tensor(indices, dtype=torch.long), torch.tensor(label, dtype=torch.float32)

def train_validity():
    set_seed(root_config.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log_info(f"Training Trainable Embedding Validity on device: {device}")

    # Load Word2Vec model
    w2v_path = ROOT_DIR / "evaluator" / "evaluator_w2v.model"
    w2v = Word2Vec.load(str(w2v_path))

    # Construct pretrained weight matrix
    vocab_size = len(w2v.wv)
    pretrained_weights = np.zeros((vocab_size + 2, w2v.vector_size), dtype=np.float32)
    # index 0: padding (zeros)
    # index 1: OOV (zeros)
    for word, idx in w2v.wv.key_to_index.items():
        pretrained_weights[idx + 2] = w2v.wv[word]

    # Datasets
    data_dir = ROOT_DIR / "models" / "validity_data"
    train_dataset = IndexedValidityDataset(data_dir / "train.json", w2v)
    val_dataset = IndexedValidityDataset(data_dir / "val.json", w2v)
    test_dataset = IndexedValidityDataset(data_dir / "test.json", w2v)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)
    test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)

    # Initialize model
    model = SentenceValidityBiGRU(
        vocab_size=vocab_size + 2,
        word_dim=w2v.vector_size,
        gru_hidden=128,
        dropout=0.2,
        pretrained_weights=pretrained_weights
    ).to(device)
    
    criterion = nn.BCELoss()
    # Use standard lr=1e-3, but allow fine-tuning embeddings
    optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', factor=0.5, patience=2)

    epochs = 15
    best_val_acc = 0.0

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        for batch_x, batch_y in train_loader:
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device).unsqueeze(-1)
            
            optimizer.zero_grad()
            outputs = model(batch_x)
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
            for batch_x, batch_y in val_loader:
                batch_x = batch_x.to(device)
                batch_y = batch_y.to(device).unsqueeze(-1)
                
                outputs = model(batch_x)
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
            
    # Test
    model.eval()
    test_correct = 0
    test_total = 0
    with torch.no_grad():
        for batch_x, batch_y in test_loader:
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device).unsqueeze(-1)
            outputs = model(batch_x)
            preds = (outputs >= 0.5).float()
            test_correct += torch.sum(preds == batch_y).item()
            test_total += len(batch_x)
    test_acc = test_correct / test_total
    log_info(f"Final Test Accuracy: {test_acc*100:.2f}%")

if __name__ == "__main__":
    train_validity()
