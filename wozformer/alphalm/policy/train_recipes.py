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
from policy.model import AlphaLMPolicyMLP
from tokenizer import clean_and_tokenize
from embeddings import get_mean_vector
from utils import log_info, set_seed

class RecipesPolicyDataset(Dataset):
    def __init__(self, json_path: Path, w2v_model_path: Path, window_size: int = 4):
        self.samples = []
        self.labels = []
        self.window_size = window_size
        
        # Load Word2Vec
        w2v = Word2Vec.load(str(w2v_model_path))
        self.vector_size = w2v.vector_size
        
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        log_info(f"Embedding {len(data)} recipe policy samples from {json_path.name}...")
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
                
            sent_vectors = []
            for sent in padded:
                tokens = clean_and_tokenize(sent)
                mean_vec = get_mean_vector(w2v, tokens)
                sent_vectors.append(mean_vec)
                
            feature_vector = np.concatenate(sent_vectors)
            self.samples.append(feature_vector)
            self.labels.append(label)
            
        self.samples = torch.tensor(np.array(self.samples), dtype=torch.float32)
        self.labels = torch.tensor(np.array(self.labels), dtype=torch.float32).unsqueeze(1)
        
    def __len__(self):
        return len(self.samples)
        
    def __getitem__(self, idx):
        return self.samples[idx], self.labels[idx]

def train_policy():
    set_seed(root_config.SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log_info(f"Training Recipe Policy Head on device: {device}")
    
    w2v_path = ROOT_DIR / "models" / "recipes_word2vec.model"
    data_dir = ROOT_DIR / "policy" / "data_recipes"
    
    train_dataset = RecipesPolicyDataset(data_dir / "train.json", w2v_path)
    val_dataset = RecipesPolicyDataset(data_dir / "val.json", w2v_path)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False)
    
    # input_dim = window_size * embedding_dim = 4 * 128 = 512
    input_dim = 4 * 128
    model = AlphaLMPolicyMLP(
        input_dim=input_dim,
        hidden_layers=[256, 64],
        dropout=0.2
    ).to(device)
    
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=1e-3)
    
    best_val_loss = float("inf")
    patience = 5
    patience_counter = 0
    epochs = 20
    checkpoint_path = ROOT_DIR / "models" / "policy_recipes.pt"
    
    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            
            optimizer.zero_grad()
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
            loss.backward()
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
        
        with torch.no_grad():
            for batch_x, batch_y in val_loader:
                batch_x, batch_y = batch_x.to(device), batch_y.to(device)
                outputs = model(batch_x)
                loss = criterion(outputs, batch_y)
                
                val_loss += loss.item() * batch_x.size(0)
                preds = (outputs >= 0.5).float()
                val_correct += (preds == batch_y).sum().item()
                val_total += batch_x.size(0)
                
        epoch_val_loss = val_loss / val_total
        epoch_val_acc = val_correct / val_total
        
        log_info(f"Epoch {epoch}/{epochs} - Train Loss: {epoch_train_loss:.4f}, Train Acc: {epoch_train_acc*100:.2f}% | Val Loss: {epoch_val_loss:.4f}, Val Acc: {epoch_val_acc*100:.2f}%")
        
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
        test_dataset = RecipesPolicyDataset(test_path, w2v_path)
        test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False)
        model.load_state_dict(torch.load(str(checkpoint_path)))
        model.eval()
        
        test_correct = 0
        test_total = 0
        
        y_true = []
        y_pred = []
        y_scores = []
        
        with torch.no_grad():
            for batch_x, batch_y in test_loader:
                batch_x, batch_y = batch_x.to(device), batch_y.to(device)
                outputs = model(batch_x)
                preds = (outputs >= 0.5).float()
                
                test_correct += (preds == batch_y).sum().item()
                test_total += batch_x.size(0)
                
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
            
        print("\n--- Recipe Policy Test Metrics ---")
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
        with open(ROOT_DIR / "models" / "policy_recipes_metrics.json", "w") as f:
            json.dump(metrics_dict, f, indent=2)

if __name__ == "__main__":
    train_policy()
