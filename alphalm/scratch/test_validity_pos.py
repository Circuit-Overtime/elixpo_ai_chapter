import sys
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from pathlib import Path
from gensim.models import Word2Vec
import spacy

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

class SentenceValidityBiGRU(nn.Module):
    def __init__(self, word_dim: int = 118, gru_hidden: int = 128, dropout: float = 0.2):
        super().__init__()
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
        gru_out, _ = self.gru(x)
        sent_emb, _ = torch.max(gru_out, dim=1)
        return self.mlp(sent_emb)

class POSValidityDataset(Dataset):
    def __init__(self, data_path: Path, w2v_model: Word2Vec, max_len: int = 30):
        with open(data_path, "r", encoding="utf-8") as f:
            self.samples = json.load(f)
        self.w2v = w2v_model
        self.max_len = max_len
        self.vector_size = w2v_model.vector_size
        
        self.embedded_samples = []
        log_info(f"POS Embedding {len(self.samples)} samples from {data_path.name}...")
        for sample in self.samples:
            word_embs = self._embed_sentence(sample["text"])
            label = float(sample["label"])
            self.embedded_samples.append((word_embs, label))

    def _embed_sentence(self, sentence: str) -> np.ndarray:
        doc = nlp(sentence)
        embs = []
        for t in doc:
            if not t.is_space and not t.is_punct and not t.is_quote:
                word = t.text.lower().strip()
                if word:
                    # Word2Vec embedding
                    if word in self.w2v.wv:
                        w_emb = self.w2v.wv[word]
                    else:
                        w_emb = np.zeros(self.vector_size, dtype=np.float32)
                        
                    # POS embedding (one-hot of size 18)
                    pos_emb = np.zeros(18, dtype=np.float32)
                    pos_idx = POS_MAP.get(t.pos_, 17)
                    pos_emb[pos_idx] = 1.0
                    
                    # Concatenate Word2Vec and POS one-hot (dim = 118)
                    emb = np.concatenate((w_emb, pos_emb))
                    embs.append(emb)
                    
        # Pad/slice to max_len
        while len(embs) < self.max_len:
            embs.append(np.zeros(self.vector_size + 18, dtype=np.float32))
            
        if len(embs) > self.max_len:
            embs = embs[:self.max_len]
            
        return np.array(embs, dtype=np.float32)

    def __len__(self):
        return len(self.embedded_samples)

    def __getitem__(self, idx):
        word_embs, label = self.embedded_samples[idx]
        return torch.tensor(word_embs, dtype=torch.float32), torch.tensor(label, dtype=torch.float32)

def train_validity():
    set_seed(root_config.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log_info(f"Training POS Sentence Validity on device: {device}")

    w2v_path = ROOT_DIR / "evaluator" / "evaluator_w2v.model"
    w2v = Word2Vec.load(str(w2v_path))

    data_dir = ROOT_DIR / "models" / "validity_data"
    train_dataset = POSValidityDataset(data_dir / "train.json", w2v)
    val_dataset = POSValidityDataset(data_dir / "val.json", w2v)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)

    model = SentenceValidityBiGRU(word_dim=w2v.vector_size + 18, gru_hidden=128, dropout=0.2).to(device)
    
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

if __name__ == "__main__":
    train_validity()
