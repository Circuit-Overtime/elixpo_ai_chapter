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
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

import config as root_config
from models.makes_sense_transformer import MakesSenseTransformer
from tokenizer import clean_and_tokenize
from embeddings import get_mean_vector
from utils import log_info, set_seed

class TrajectoryDatasetTransformer(Dataset):
    def __init__(self, data_path: Path, w2v_model: Word2Vec, max_len: int = 6):
        with open(data_path, "r", encoding="utf-8") as f:
            self.samples = json.load(f)
        self.w2v = w2v_model
        self.max_len = max_len
        self.vector_size = w2v_model.vector_size
        
        # Pre-embed to speed up training epoch loops
        self.embedded_samples = []
        log_info(f"Embedding {len(self.samples)} samples from {data_path.name}...")
        for sample in self.samples:
            pos_emb = self._embed_trajectory(sample["positive"])
            neg_emb = self._embed_trajectory(sample["negative"])
            weight = float(sample.get("weight", 1.0))
            self.embedded_samples.append((pos_emb, neg_emb, weight))

    def _embed_trajectory(self, trajectory: list) -> np.ndarray:
        embs = []
        for sent in trajectory:
            tokens = clean_and_tokenize(sent)
            emb = get_mean_vector(self.w2v, tokens)
            embs.append(emb)
        
        # Prefix Padding (insert zeros at the beginning)
        while len(embs) < self.max_len:
            embs.insert(0, np.zeros(self.vector_size, dtype=np.float32))
            
        if len(embs) > self.max_len:
            embs = embs[-self.max_len:]
            
        return np.array(embs, dtype=np.float32)

    def __len__(self):
        return len(self.embedded_samples)

    def __getitem__(self, idx):
        pos_emb, neg_emb, weight = self.embedded_samples[idx]
        return (
            torch.tensor(pos_emb, dtype=torch.float32),
            torch.tensor(neg_emb, dtype=torch.float32),
            torch.tensor(weight, dtype=torch.float32)
        )

def train_makes_sense():
    set_seed(root_config.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log_info(f"Training TinyStories Makes-Sense Transformer on device: {device}")
    
    # 1. Load custom Word2Vec
    w2v_path = ROOT_DIR / "models" / "tinystories_word2vec.model"
    w2v = Word2Vec.load(str(w2v_path))
    
    # 2. Datasets
    data_dir = ROOT_DIR / "models" / "makes_sense_tinystories_data"
    
    train_dataset = TrajectoryDatasetTransformer(data_dir / "train.json", w2v)
    val_dataset = TrajectoryDatasetTransformer(data_dir / "val.json", w2v)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)
    
    # 3. Model
    model = MakesSenseTransformer(
        sentence_dim=w2v.vector_size,
        hidden_dim=128,
        num_heads=4,
        num_layers=2,
        dim_feedforward=256,
        dropout=0.2
    ).to(device)
    
    margin = 0.1
    criterion = nn.MarginRankingLoss(margin=margin, reduction='none')
    optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=2)
    
    epochs = 15
    best_val_loss = float('inf')
    best_model_path = ROOT_DIR / "models" / "makes_sense_tinystories_transformer.pt"
    best_model_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Training Loop
    for epoch in range(1, epochs + 1):
        model.train()
        train_loss_sum = 0.0
        train_weight_sum = 0.0
        correct_order_count = 0
        total_samples = 0
        
        for pos_batch, neg_batch, weight_batch in train_loader:
            pos_batch = pos_batch.to(device)
            neg_batch = neg_batch.to(device)
            weight_batch = weight_batch.to(device)
            
            optimizer.zero_grad()
            
            pos_scores = model(pos_batch).squeeze(-1)
            neg_scores = model(neg_batch).squeeze(-1)
            
            target = torch.ones_like(pos_scores).to(device)
            loss = criterion(pos_scores, neg_scores, target)
            
            weighted_loss = (loss * weight_batch).mean()
            weighted_loss.backward()
            optimizer.step()
            
            train_loss_sum += weighted_loss.item() * len(pos_batch)
            train_weight_sum += len(pos_batch)
            
            correct_order_count += torch.sum(pos_scores > neg_scores).item()
            total_samples += len(pos_batch)
            
        train_avg_loss = train_loss_sum / train_weight_sum
        train_acc = correct_order_count / total_samples
        
        # Validation
        model.eval()
        val_loss_sum = 0.0
        val_weight_sum = 0.0
        val_correct_order = 0
        val_total = 0
        
        with torch.no_grad():
            for pos_batch, neg_batch, weight_batch in val_loader:
                pos_batch = pos_batch.to(device)
                neg_batch = neg_batch.to(device)
                weight_batch = weight_batch.to(device)
                
                pos_scores = model(pos_batch).squeeze(-1)
                neg_scores = model(neg_batch).squeeze(-1)
                target = torch.ones_like(pos_scores).to(device)
                
                loss = criterion(pos_scores, neg_scores, target)
                weighted_loss = (loss * weight_batch).mean()
                
                val_loss_sum += weighted_loss.item() * len(pos_batch)
                val_weight_sum += len(pos_batch)
                
                val_correct_order += torch.sum(pos_scores > neg_scores).item()
                val_total += len(pos_batch)
                
        val_avg_loss = val_loss_sum / val_weight_sum
        val_acc = val_correct_order / val_total
        
        scheduler.step(val_avg_loss)
        log_info(f"Epoch {epoch:02d}/{epochs} - Train Loss: {train_avg_loss:.4f}, Train Acc (Ranking): {train_acc*100:.2f}% | Val Loss: {val_avg_loss:.4f}, Val Acc (Ranking): {val_acc*100:.2f}%")
        
        if val_avg_loss < best_val_loss:
            best_val_loss = val_avg_loss
            torch.save(model.state_dict(), str(best_model_path))
            log_info(f"  --> Saved new best checkpoint to {best_model_path.name} (Val Loss: {best_val_loss:.4f})")
            
    # Test Evaluation
    test_path = data_dir / "test.json"
    if test_path.exists():
        test_dataset = TrajectoryDatasetTransformer(test_path, w2v)
        test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)
        model.load_state_dict(torch.load(str(best_model_path), map_location=device, weights_only=True))
        model.eval()
        
        test_correct = 0
        test_total = 0
        
        y_pos_scores = []
        y_neg_scores = []
        
        with torch.no_grad():
            for pos_batch, neg_batch, _ in test_loader:
                pos_batch = pos_batch.to(device)
                neg_batch = neg_batch.to(device)
                pos_scores = model(pos_batch).squeeze(-1)
                neg_scores = model(neg_batch).squeeze(-1)
                
                test_correct += torch.sum(pos_scores > neg_scores).item()
                test_total += len(pos_batch)
                
                y_pos_scores.extend(pos_scores.cpu().numpy().tolist())
                y_neg_scores.extend(neg_scores.cpu().numpy().tolist())
                
        test_acc = test_correct / test_total
        
        # Binary classifications for AUC
        auc = 0.0
        ranking_wins = 0
        for ps in y_pos_scores:
            for ns in y_neg_scores:
                if ps > ns:
                    ranking_wins += 1
                elif ps == ns:
                    ranking_wins += 0.5
        if y_pos_scores and y_neg_scores:
            auc = ranking_wins / (len(y_pos_scores) * len(y_neg_scores))
            
        print("\n--- Makes-Sense Transformer Test Metrics ---")
        print(f"Pairwise Ranking Accuracy: {test_acc*100:.2f}%")
        print(f"ROC AUC:                   {auc:.4f}")
        
        # Save metrics
        metrics_dict = {
            "pairwise_accuracy": test_acc,
            "auc": auc
        }
        with open(ROOT_DIR / "models" / "makes_sense_tinystories_transformer_metrics.json", "w") as f:
            json.dump(metrics_dict, f, indent=2)

if __name__ == "__main__":
    train_makes_sense()
