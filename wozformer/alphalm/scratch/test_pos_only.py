import sys
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from pathlib import Path
import spacy
import random

# Add parent directory to path
SCRATCH_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRATCH_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from utils import log_info, set_seed

# Initialize spaCy
nlp = spacy.load("en_core_web_sm", disable=["parser", "ner"])

POS_TAGS = ['ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', 'DET', 'INTJ', 'NOUN', 'NUM', 'PART', 'PRON', 'PROPN', 'PUNCT', 'SCONJ', 'SYM', 'VERB', 'X']
POS_MAP = {tag: i for i, tag in enumerate(POS_TAGS)}

class POSSeqBiGRU(nn.Module):
    def __init__(self, vocab_size: int = 19, embed_dim: int = 32, gru_hidden: int = 64, dropout: float = 0.2):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.gru = nn.GRU(
            input_size=embed_dim,
            hidden_size=gru_hidden,
            num_layers=1,
            batch_first=True,
            bidirectional=True
        )
        self.mlp = nn.Sequential(
            nn.Linear(gru_hidden * 2, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
            nn.Sigmoid()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        embedded = self.embedding(x)
        gru_out, _ = self.gru(embedded)
        sent_emb, _ = torch.max(gru_out, dim=1)
        return self.mlp(sent_emb)

class POSSeqDataset(Dataset):
    def __init__(self, data_path: Path, max_len: int = 30):
        with open(data_path, "r", encoding="utf-8") as f:
            self.samples = json.load(f)
        self.max_len = max_len
        
        self.samples_indices = []
        log_info(f"Processing POS sequences for {len(self.samples)} samples from {data_path.name}...")
        for sample in self.samples:
            indices = self._text_to_pos_indices(sample["text"])
            label = float(sample["label"])
            self.samples_indices.append((indices, label))

    def _text_to_pos_indices(self, sentence: str) -> np.ndarray:
        doc = nlp(sentence)
        indices = []
        for t in doc:
            if not t.is_space and not t.is_punct and not t.is_quote:
                pos_idx = POS_MAP.get(t.pos_, 17) # 17 is OOV POS
                indices.append(pos_idx + 2) # 0 is padding, 1 is OOV word (not used here)
                
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
    log_info(f"Training POS Seq Validity on device: {device}")

    data_dir = ROOT_DIR / "models" / "validity_data"
    train_dataset = POSSeqDataset(data_dir / "train.json")
    val_dataset = POSSeqDataset(data_dir / "val.json")
    test_dataset = POSSeqDataset(data_dir / "test.json")
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)
    test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)

    model = POSSeqBiGRU().to(device)
    criterion = nn.BCELoss()
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
