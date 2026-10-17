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
POLICY_DIR = Path(__file__).resolve().parent
ROOT_DIR = POLICY_DIR.parent
sys.path.append(str(ROOT_DIR))

import config as root_config
from policy.model import AlphaLMPolicyMLPV652
from tokenizer import clean_and_tokenize
from utils import log_info, set_seed

class RecipesPolicyDatasetV652(Dataset):
    def __init__(self, json_path: Path, w2v_model: Word2Vec, window_size: int = 4, max_len_sent: int = 30):
        self.samples = []
        self.masks = []
        self.labels = []
        self.window_size = window_size
        self.max_len_sent = max_len_sent
        self.w2v = w2v_model
        
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        log_info(f"Tokenizing {len(data)} recipe policy samples from {json_path.name}...")
        for item in data:
            context = item["context"]
            candidate = item["candidate"]
            label = float(item["label"])
            
            combined_sentences = context + [candidate]
            if len(combined_sentences) < self.window_size:
                first_sent = context[0] if context else candidate
                padded = [first_sent] * (self.window_size - len(combined_sentences)) + combined_sentences
            else:
                padded = combined_sentences[-self.window_size:]
                
            sent_x = []
            sent_mask = []
            for sent in padded:
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
                sent_x.append(indices)
                sent_mask.append(mask)
                
            self.samples.append(sent_x)
            self.masks.append(sent_mask)
            self.labels.append(label)
            
    def __len__(self):
        return len(self.labels)
        
    def __getitem__(self, idx):
        return (
            torch.tensor(self.samples[idx], dtype=torch.long),
            torch.tensor(self.masks[idx], dtype=torch.bool),
            torch.tensor(self.labels[idx], dtype=torch.float32).unsqueeze(0)
        )

def train_policy_v652():
    set_seed(root_config.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log_info(f"Training Recipe Policy Head v6.5.2 on device: {device}")
    
    # 1. Load Word2Vec and build pretrained weights
    w2v_path = ROOT_DIR / "models" / "recipes_word2vec.model"
    w2v = Word2Vec.load(str(w2v_path))
    vocab_size = len(w2v.wv) + 2
    
    pretrained_weights = np.zeros((vocab_size, w2v.vector_size), dtype=np.float32)
    pretrained_weights[2:] = w2v.wv.vectors
    pretrained_weights[1] = np.random.normal(scale=0.1, size=w2v.vector_size) # OOV
    
    data_dir = ROOT_DIR / "policy" / "data_recipes"
    
    train_dataset = RecipesPolicyDatasetV652(data_dir / "train.json", w2v)
    val_dataset = RecipesPolicyDatasetV652(data_dir / "val.json", w2v)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)
    
    # 2. Model — embeddings unfrozen from start with lower LR
    model = AlphaLMPolicyMLPV652(
        vocab_size=vocab_size,
        embedding_dim=w2v.vector_size,
        d_model=128,
        n_heads=4,
        n_layers=2,
        d_ff=256,
        dropout=0.2,
        max_len_sent=30,
        pretrained_weights=pretrained_weights,
        freeze_emb=False,  # Train from start
        window_size=4,
        hidden_layers=[512, 256, 64],
        policy_dropout=0.2
    ).to(device)
    
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    log_info(f"Model created. Total Parameters: {total_params:,} | Trainable Parameters: {trainable_params:,}")
    
    # Use class-weighted BCE to handle imbalance (dataset is ~97% negative)
    # Count positive/negative labels
    pos_count = sum(1 for l in train_dataset.labels if l == 1.0)
    neg_count = len(train_dataset.labels) - pos_count
    pos_weight_val = neg_count / max(pos_count, 1)
    log_info(f"Label distribution: {pos_count} positive, {neg_count} negative. pos_weight = {pos_weight_val:.2f}")
    
    pos_weight = torch.tensor([pos_weight_val], dtype=torch.float32).to(device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    
    # Separate parameter groups: embeddings get a lower LR
    emb_params = list(model.sentence_encoder.embedding.parameters())
    non_emb_params = [p for name, p in model.named_parameters() if 'sentence_encoder.embedding' not in name]
    
    optimizer = optim.AdamW([
        {'params': non_emb_params, 'lr': 5e-4},
        {'params': emb_params, 'lr': 1e-4}
    ], weight_decay=1e-4)
    
    best_val_loss = float("inf")
    patience = 6
    patience_counter = 0
    epochs = 25
    checkpoint_path = ROOT_DIR / "models" / "policy_recipes_v652.pt"
    
    # We need to modify the model to output logits instead of sigmoid for BCEWithLogitsLoss.
    # The AlphaLMPolicyMLP applies sigmoid at the end. We'll override by removing it during training.
    # Actually, let's just use standard BCELoss with the sigmoid output and handle imbalance differently.
    # Switch back to BCELoss with sample weights.
    criterion = nn.BCELoss(reduction='none')
    
    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        for batch_x, batch_mask, batch_y in train_loader:
            batch_x, batch_mask, batch_y = batch_x.to(device), batch_mask.to(device), batch_y.to(device)
            
            optimizer.zero_grad()
            outputs = model(batch_x, batch_mask)
            
            # Per-sample weighting: upweight positive samples
            sample_weights = torch.where(batch_y > 0.5, pos_weight_val, 1.0)
            loss = criterion(outputs, batch_y)
            loss = (loss * sample_weights).mean()
            
            loss.backward()
            
            # Gradient clipping
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            
            optimizer.step()
            
            train_loss += loss.item() * batch_x.size(0)
            preds = (outputs >= 0.5).float()
            train_correct += (preds == batch_y).sum().item()
            train_total += batch_x.size(0)
            
        epoch_train_loss = train_loss / train_total
        epoch_train_acc = train_correct / train_total
        
        # Validation
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0
        val_tp = 0
        val_fp = 0
        val_fn = 0
        
        with torch.no_grad():
            for batch_x, batch_mask, batch_y in val_loader:
                batch_x, batch_mask, batch_y = batch_x.to(device), batch_mask.to(device), batch_y.to(device)
                outputs = model(batch_x, batch_mask)
                loss = criterion(outputs, batch_y).mean()
                
                val_loss += loss.item() * batch_x.size(0)
                preds = (outputs >= 0.5).float()
                val_correct += (preds == batch_y).sum().item()
                val_total += batch_x.size(0)
                
                val_tp += ((preds == 1.0) & (batch_y == 1.0)).sum().item()
                val_fp += ((preds == 1.0) & (batch_y == 0.0)).sum().item()
                val_fn += ((preds == 0.0) & (batch_y == 1.0)).sum().item()
                
        epoch_val_loss = val_loss / val_total
        epoch_val_acc = val_correct / val_total
        val_precision = val_tp / (val_tp + val_fp) if (val_tp + val_fp) > 0 else 0.0
        val_recall = val_tp / (val_tp + val_fn) if (val_tp + val_fn) > 0 else 0.0
        
        log_info(f"Epoch {epoch}/{epochs} - Train Loss: {epoch_train_loss:.4f}, Train Acc: {epoch_train_acc*100:.2f}% | Val Loss: {epoch_val_loss:.4f}, Val Acc: {epoch_val_acc*100:.2f}% | Val P: {val_precision*100:.1f}% R: {val_recall*100:.1f}%")
        
        if epoch_val_loss < best_val_loss:
            best_val_loss = epoch_val_loss
            patience_counter = 0
            torch.save(model.state_dict(), str(checkpoint_path))
            log_info(f"  --> Saved new best recipe policy checkpoint to {checkpoint_path.name}")
        else:
            patience_counter += 1
            if patience_counter >= patience:
                log_info(f"Early stopping triggered at epoch {epoch}.")
                break
                
    # Evaluate on test set
    test_path = data_dir / "test.json"
    if test_path.exists():
        test_dataset = RecipesPolicyDatasetV652(test_path, w2v)
        test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)
        model.load_state_dict(torch.load(str(checkpoint_path), map_location=device, weights_only=True))
        model.eval()
        
        test_correct = 0
        test_total = 0
        
        y_true = []
        y_pred = []
        y_scores = []
        
        with torch.no_grad():
            for batch_x, batch_mask, batch_y in test_loader:
                batch_x, batch_mask, batch_y = batch_x.to(device), batch_mask.to(device), batch_y.to(device)
                outputs = model(batch_x, batch_mask)
                preds = (outputs >= 0.5).float()
                
                test_correct += (preds == batch_y).sum().item()
                test_total += batch_x.size(0)
                
                y_true.extend(batch_y.view(-1).cpu().numpy().tolist())
                y_pred.extend(preds.view(-1).cpu().numpy().tolist())
                y_scores.extend(outputs.view(-1).cpu().numpy().tolist())
                
        test_acc = test_correct / test_total
        
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
            
        print("\n--- Recipe Policy v6.5.2 Test Metrics ---")
        print(f"Accuracy:         {test_acc*100:.2f}%")
        print(f"Precision:        {precision*100:.2f}%")
        print(f"Recall:           {recall*100:.2f}%")
        print(f"F1 Score:         {f1:.4f}")
        print(f"ROC AUC:          {auc:.4f}")
        print(f"Total Parameters: {total_params:,}")
        
        metrics_dict = {
            "accuracy": test_acc,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "auc": auc,
            "total_params": total_params
        }
        with open(ROOT_DIR / "models" / "policy_recipes_v652_metrics.json", "w") as f:
            json.dump(metrics_dict, f, indent=2)

if __name__ == "__main__":
    train_policy_v652()
