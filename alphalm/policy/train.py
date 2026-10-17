import sys
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from pathlib import Path

# Add parent directory to sys.path to allow imports from root folder
POLICY_DIR = Path(__file__).resolve().parent
sys.path.append(str(POLICY_DIR.parent))

import policy.policy_config as policy_config
from policy.dataset import PolicyDataset
from policy.model import AlphaLMPolicyMLP
from utils import log_info, set_seed

def train_policy():
    set_seed(policy_config.SEED)
    
    log_info("Loading train and val policy datasets...")
    train_dataset = PolicyDataset(
        policy_config.TRAIN_DATA_PATH,
        policy_config.W2V_MODEL_PATH,
        use_scalar_features=policy_config.USE_SCALAR_FEATURES
    )
    val_dataset = PolicyDataset(
        policy_config.VAL_DATA_PATH,
        policy_config.W2V_MODEL_PATH,
        use_scalar_features=policy_config.USE_SCALAR_FEATURES
    )
    
    train_loader = DataLoader(train_dataset, batch_size=policy_config.BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=policy_config.BATCH_SIZE, shuffle=False)
    
    # Calculate input dimension
    input_dim = policy_config.WINDOW_SIZE * policy_config.EMBEDDING_DIM
    if policy_config.USE_SCALAR_FEATURES:
        input_dim += policy_config.NUM_SCALAR_FEATURES
        
    log_info(f"Policy model input dimension: {input_dim}")
    
    model = AlphaLMPolicyMLP(
        input_dim=input_dim,
        hidden_layers=policy_config.HIDDEN_LAYERS,
        dropout=policy_config.DROPOUT
    )
    
    # Check for GPU
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    log_info(f"Training on device: {device}")
    
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=policy_config.LEARNING_RATE)
    
    best_val_loss = float("inf")
    patience_counter = 0
    
    log_info("Starting training loop...")
    for epoch in range(1, policy_config.EPOCHS + 1):
        # Training
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
        
        log_info(f"Epoch {epoch}/{policy_config.EPOCHS} - "
                 f"Train Loss: {epoch_train_loss:.4f}, Train Acc: {epoch_train_acc:.4f} | "
                 f"Val Loss: {epoch_val_loss:.4f}, Val Acc: {epoch_val_acc:.4f}")
                 
        # Early Stopping check
        if epoch_val_loss < best_val_loss:
            best_val_loss = epoch_val_loss
            patience_counter = 0
            # Save the best model
            torch.save(model.state_dict(), str(policy_config.CHECKPOINT_PATH))
            log_info(f"--> Saved best model checkpoint to: {policy_config.CHECKPOINT_PATH}")
        else:
            patience_counter += 1
            if patience_counter >= policy_config.PATIENCE:
                log_info(f"Early stopping triggered at epoch {epoch}.")
                break
                
    log_info("Training completed.")

if __name__ == "__main__":
    train_policy()
