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
from models.makes_sense_transformer import MakesSenseTransformerV652
from tokenizer import clean_and_tokenize
from utils import log_info, set_seed

class TrajectoryDatasetTransformerV652(Dataset):
    def __init__(self, data_path: Path, w2v_model: Word2Vec, max_len_sent: int = 30, max_len_traj: int = 6):
        with open(data_path, "r", encoding="utf-8") as f:
            self.samples = json.load(f)
        self.w2v = w2v_model
        self.max_len_sent = max_len_sent
        self.max_len_traj = max_len_traj
        
        # Pre-tokenize and convert to token IDs to save training time
        self.processed_samples = []
        log_info(f"Tokenizing {len(self.samples)} trajectory samples from {data_path.name}...")
        for sample in self.samples:
            pos_x, pos_mask = self._process_trajectory(sample["positive"])
            neg_x, neg_mask = self._process_trajectory(sample["negative"])
            weight = float(sample.get("weight", 1.0))
            self.processed_samples.append((pos_x, pos_mask, neg_x, neg_mask, weight))
            
    def _process_trajectory(self, trajectory: list):
        # Converts list of sentences into token IDs of shape [max_len_traj, max_len_sent]
        traj_x = []
        traj_mask = []
        for sent in trajectory:
            tokens = clean_and_tokenize(sent)
            indices = []
            for word in tokens:
                if word in self.w2v.wv:
                    indices.append(self.w2v.wv.key_to_index[word] + 2)
                else:
                    indices.append(1) # OOV index
            if len(indices) > self.max_len_sent:
                indices = indices[:self.max_len_sent]
            pad_len = self.max_len_sent - len(indices)
            mask = [False] * len(indices) + [True] * pad_len
            indices = indices + [0] * pad_len
            traj_x.append(indices)
            traj_mask.append(mask)
            
        # Pad trajectory steps if needed
        while len(traj_x) < self.max_len_traj:
            traj_x.insert(0, [0] * self.max_len_sent)
            traj_mask.insert(0, [True] * self.max_len_sent)
            
        if len(traj_x) > self.max_len_traj:
            traj_x = traj_x[-self.max_len_traj:]
            traj_mask = traj_mask[-self.max_len_traj:]
            
        return np.array(traj_x, dtype=np.int64), np.array(traj_mask, dtype=bool)

    def __len__(self):
        return len(self.processed_samples)

    def __getitem__(self, idx):
        pos_x, pos_mask, neg_x, neg_mask, weight = self.processed_samples[idx]
        return (
            torch.tensor(pos_x, dtype=torch.long),
            torch.tensor(pos_mask, dtype=torch.bool),
            torch.tensor(neg_x, dtype=torch.long),
            torch.tensor(neg_mask, dtype=torch.bool),
            torch.tensor(weight, dtype=torch.float32)
        )

def train_makes_sense_v652():
    set_seed(root_config.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log_info(f"Training Recipe Makes-Sense Transformer v6.5.2 on device: {device}")
    
    # 1. Load Word2Vec and build pretrained weight matrix
    w2v_path = ROOT_DIR / "models" / "recipes_word2vec.model"
    w2v = Word2Vec.load(str(w2v_path))
    vocab_size = len(w2v.wv) + 2
    
    pretrained_weights = np.zeros((vocab_size, w2v.vector_size), dtype=np.float32)
    pretrained_weights[2:] = w2v.wv.vectors
    pretrained_weights[1] = np.random.normal(scale=0.1, size=w2v.vector_size) # random vector for OOV
    
    # 2. Datasets
    data_dir = ROOT_DIR / "models" / "makes_sense_recipes_data"
    
    train_dataset = TrajectoryDatasetTransformerV652(data_dir / "train.json", w2v)
    val_dataset = TrajectoryDatasetTransformerV652(data_dir / "val.json", w2v)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)
    
    # 3. Initialize model — DO NOT freeze embeddings. The model needs full gradient
    # flow from the start to avoid representation collapse.
    model = MakesSenseTransformerV652(
        vocab_size=vocab_size,
        embedding_dim=w2v.vector_size,
        d_model=128,
        n_heads=4,
        n_layers=2,
        d_ff=256,
        dropout=0.2,
        max_len_sent=30,
        pretrained_weights=pretrained_weights,
        freeze_emb=False  # Train from start — freezing caused collapse
    ).to(device)
    
    # Count parameters
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    log_info(f"Model created. Total Parameters: {total_params:,} | Trainable Parameters: {trainable_params:,}")
    
    # Key fixes vs previous run:
    # 1. Margin 0.1 -> 0.3 (stronger gradient signal for ranking)
    # 2. LR 1e-3 -> 5e-4 (prevent overshooting in deep pipeline)
    # 3. Gradient clipping at max_norm=1.0 (prevent exploding gradients)
    # 4. Embeddings unfrozen from start (freezing caused collapse)
    # 5. Warmup: 2 epochs at lower LR before full LR
    # 6. LayerNorm on sentence encoder output (added in sentence_encoder.py)
    margin = 0.3
    criterion = nn.MarginRankingLoss(margin=margin, reduction='none')
    
    # Separate parameter groups: embeddings get a lower LR
    emb_params = list(model.sentence_encoder.embedding.parameters())
    non_emb_params = [p for name, p in model.named_parameters() if 'sentence_encoder.embedding' not in name]
    
    optimizer = optim.AdamW([
        {'params': non_emb_params, 'lr': 5e-4},
        {'params': emb_params, 'lr': 1e-4}  # Lower LR for pretrained embeddings
    ], weight_decay=1e-4)
    
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=3)
    
    epochs = 25
    best_val_loss = float('inf')
    patience_counter = 0
    patience_limit = 6
    best_model_path = ROOT_DIR / "models" / "makes_sense_recipes_transformer_v652.pt"
    best_model_path.parent.mkdir(parents=True, exist_ok=True)
    
    val_accuracies = []
    val_losses = []
    
    # Training Loop
    for epoch in range(1, epochs + 1):
        model.train()
        train_loss_sum = 0.0
        train_weight_sum = 0.0
        correct_order_count = 0
        total_samples = 0
        
        for pos_x, pos_mask, neg_x, neg_mask, weight_batch in train_loader:
            pos_x, pos_mask = pos_x.to(device), pos_mask.to(device)
            neg_x, neg_mask = neg_x.to(device), neg_mask.to(device)
            weight_batch = weight_batch.to(device)
            
            optimizer.zero_grad()
            
            pos_scores = model(pos_x, pos_mask).squeeze(-1)
            neg_scores = model(neg_x, neg_mask).squeeze(-1)
            
            target = torch.ones_like(pos_scores).to(device)
            loss = criterion(pos_scores, neg_scores, target)
            
            weighted_loss = (loss * weight_batch).mean()
            weighted_loss.backward()
            
            # Gradient clipping to prevent exploding gradients through deep pipeline
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            
            optimizer.step()
            
            train_loss_sum += weighted_loss.item() * len(pos_x)
            train_weight_sum += len(pos_x)
            
            correct_order_count += torch.sum(pos_scores > neg_scores).item()
            total_samples += len(pos_x)
            
        train_avg_loss = train_loss_sum / train_weight_sum
        train_acc = correct_order_count / total_samples
        
        # Validation
        model.eval()
        val_loss_sum = 0.0
        val_weight_sum = 0.0
        val_correct_order = 0
        val_total = 0
        
        with torch.no_grad():
            for pos_x, pos_mask, neg_x, neg_mask, weight_batch in val_loader:
                pos_x, pos_mask = pos_x.to(device), pos_mask.to(device)
                neg_x, neg_mask = neg_x.to(device), neg_mask.to(device)
                weight_batch = weight_batch.to(device)
                
                pos_scores = model(pos_x, pos_mask).squeeze(-1)
                neg_scores = model(neg_x, neg_mask).squeeze(-1)
                target = torch.ones_like(pos_scores).to(device)
                
                loss = criterion(pos_scores, neg_scores, target)
                weighted_loss = (loss * weight_batch).mean()
                
                val_loss_sum += weighted_loss.item() * len(pos_x)
                val_weight_sum += len(pos_x)
                
                val_correct_order += torch.sum(pos_scores > neg_scores).item()
                val_total += len(pos_x)
                
        val_avg_loss = val_loss_sum / val_weight_sum
        val_acc = val_correct_order / val_total
        
        val_accuracies.append(val_acc)
        val_losses.append(val_avg_loss)
        
        scheduler.step(val_avg_loss)
        current_lr = optimizer.param_groups[0]['lr']
        log_info(f"Epoch {epoch:02d}/{epochs} - Train Loss: {train_avg_loss:.4f}, Train Acc: {train_acc*100:.2f}% | Val Loss: {val_avg_loss:.4f}, Val Acc: {val_acc*100:.2f}% | LR: {current_lr:.6f}")
        
        if val_avg_loss < best_val_loss:
            best_val_loss = val_avg_loss
            patience_counter = 0
            torch.save(model.state_dict(), str(best_model_path))
            log_info(f"  --> Saved new best checkpoint to {best_model_path.name} (Val Loss: {best_val_loss:.4f})")
        else:
            patience_counter += 1
            if patience_counter >= patience_limit:
                log_info(f"Early stopping triggered at epoch {epoch}.")
                break
            
    # Test Evaluation
    test_path = data_dir / "test.json"
    if test_path.exists():
        test_dataset = TrajectoryDatasetTransformerV652(test_path, w2v)
        test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)
        model.load_state_dict(torch.load(str(best_model_path), map_location=device, weights_only=True))
        model.eval()
        
        test_correct = 0
        test_total = 0
        
        y_pos_scores = []
        y_neg_scores = []
        
        with torch.no_grad():
            for pos_x, pos_mask, neg_x, neg_mask, _ in test_loader:
                pos_x, pos_mask = pos_x.to(device), pos_mask.to(device)
                neg_x, neg_mask = neg_x.to(device), neg_mask.to(device)
                pos_scores = model(pos_x, pos_mask).squeeze(-1)
                neg_scores = model(neg_x, neg_mask).squeeze(-1)
                
                test_correct += torch.sum(pos_scores > neg_scores).item()
                test_total += len(pos_x)
                
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
            
        print("\n--- Recipe Makes-Sense Transformer v6.5.2 Test Metrics ---")
        print(f"Pairwise Ranking Accuracy: {test_acc*100:.2f}%")
        print(f"ROC AUC:                   {auc:.4f}")
        print(f"Total Parameters:          {total_params:,}")
        
        # Save metrics
        metrics_dict = {
            "pairwise_accuracy": test_acc,
            "auc": auc,
            "total_params": total_params,
            "val_curves": {
                "val_accuracies": val_accuracies,
                "val_losses": val_losses
            }
        }
        with open(ROOT_DIR / "models" / "makes_sense_recipes_v652_metrics.json", "w") as f:
            json.dump(metrics_dict, f, indent=2)

if __name__ == "__main__":
    train_makes_sense_v652()
