import sys
import torch
import numpy as np
from torch.utils.data import DataLoader
from pathlib import Path
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

# Add parent directory to sys.path to allow imports from root folder
EVALUATOR_DIR = Path(__file__).resolve().parent
sys.path.append(str(EVALUATOR_DIR.parent))

import evaluator.eval_config as eval_config
from evaluator.dataset import TrajectoryDataset
from evaluator.model import MakesSenseMLP
from utils import log_info

def evaluate_evaluator():
    log_info("Loading test dataset...")
    test_dataset = TrajectoryDataset(eval_config.TEST_DATA_PATH, eval_config.W2V_MODEL_PATH)
    test_loader = DataLoader(test_dataset, batch_size=eval_config.BATCH_SIZE, shuffle=False)
    
    input_dim = eval_config.WINDOW_SIZE * eval_config.EMBEDDING_DIM
    model = MakesSenseMLP(
        input_dim=input_dim,
        hidden_layers=eval_config.HIDDEN_LAYERS,
        dropout=0.0  # No dropout during evaluation
    )
    
    if not eval_config.CHECKPOINT_PATH.exists():
        log_info(f"Checkpoint not found at {eval_config.CHECKPOINT_PATH}. Train the model first.")
        return
        
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.load_state_dict(torch.load(str(eval_config.CHECKPOINT_PATH), map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    
    all_preds = []
    all_probs = []
    all_targets = []
    
    log_info("Running inference on test set...")
    with torch.no_grad():
        for batch_x, batch_y in test_loader:
            batch_x = batch_x.to(device)
            outputs = model(batch_x)
            
            probs = outputs.squeeze(1).cpu().numpy()
            preds = (probs >= 0.5).astype(float)
            targets = batch_y.squeeze(1).cpu().numpy()
            
            all_probs.extend(probs)
            all_preds.extend(preds)
            all_targets.extend(targets)
            
    all_probs = np.array(all_probs)
    all_preds = np.array(all_preds)
    all_targets = np.array(all_targets)
    
    acc = accuracy_score(all_targets, all_preds)
    prec = precision_score(all_targets, all_preds, zero_division=0)
    rec = recall_score(all_targets, all_preds, zero_division=0)
    f1 = f1_score(all_targets, all_preds, zero_division=0)
    
    try:
        auc = roc_auc_score(all_targets, all_probs)
    except ValueError:
        auc = 0.0
        
    log_info("\n" + "="*40 + "\n"
             "EVALUATOR TEST METRICS:\n"
             f"  Accuracy:  {acc:.4f}\n"
             f"  Precision: {prec:.4f}\n"
             f"  Recall:    {rec:.4f}\n"
             f"  F1 Score:  {f1:.4f}\n"
             f"  ROC AUC:   {auc:.4f}\n"
             + "="*40)

if __name__ == "__main__":
    evaluate_evaluator()
