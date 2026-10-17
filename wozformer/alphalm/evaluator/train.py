import sys
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from pathlib import Path

# Add parent directory to sys.path to allow imports from root folder
EVALUATOR_DIR = Path(__file__).resolve().parent
sys.path.append(str(EVALUATOR_DIR.parent))

import evaluator.eval_config as eval_config
from evaluator.dataset import TrajectoryDataset
from evaluator.model import MakesSenseMLP
from utils import log_info, set_seed

def train_evaluator():
    set_seed(eval_config.SEED)
    
    log_info("Loading train and val datasets...")
    train_dataset = TrajectoryDataset(eval_config.TRAIN_DATA_PATH, eval_config.W2V_MODEL_PATH)
    val_dataset = TrajectoryDataset(eval_config.VAL_DATA_PATH, eval_config.W2V_MODEL_PATH)
    
    train_loader = DataLoader(train_dataset, batch_size=eval_config.BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=eval_config.BATCH_SIZE, shuffle=False)
    
    input_dim = eval_config.WINDOW_SIZE * eval_config.EMBEDDING_DIM
    
    model = MakesSenseMLP(
        input_dim=input_dim,
        hidden_layers=eval_config.HIDDEN_LAYERS,
        dropout=eval_config.DROPOUT
    )
    
    # Check for GPU
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    log_info(f"Using device: {device}")
    
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=eval_config.LEARNING_RATE)
    
    best_val_loss = float("inf")
    patience_counter = 0
    
    log_info("Starting training loop...")
    for epoch in range(1, eval_config.EPOCHS + 1):
        # Training phase
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
        
        # Validation phase
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
        
        log_info(f"Epoch {epoch}/{eval_config.EPOCHS} - "
                 f"Train Loss: {epoch_train_loss:.4f}, Train Acc: {epoch_train_acc:.4f} | "
                 f"Val Loss: {epoch_val_loss:.4f}, Val Acc: {epoch_val_acc:.4f}")
                 
        # Early Stopping check
        if epoch_val_loss < best_val_loss:
            best_val_loss = epoch_val_loss
            patience_counter = 0
            # Save the best model
            torch.save(model.state_dict(), str(eval_config.CHECKPOINT_PATH))
            log_info(f"--> Saved best model checkpoint to: {eval_config.CHECKPOINT_PATH}")
        else:
            patience_counter += 1
            if patience_counter >= eval_config.PATIENCE:
                log_info(f"Early stopping triggered at epoch {epoch}.")
                break
                
    log_info("Training completed.")

if __name__ == "__main__":
    train_evaluator()
