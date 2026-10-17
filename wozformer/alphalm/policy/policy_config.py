import os
from pathlib import Path

# Base directories
POLICY_DIR = Path(__file__).resolve().parent
ROOT_DIR = POLICY_DIR.parent

# Raw dataset files
SALES_RAW_PATH = ROOT_DIR / "sales_dataset.txt"
NEWTON_RAW_PATH = ROOT_DIR / "newton_dataset.txt"

# Processed policy data
PROCESSED_DATA_DIR = POLICY_DIR / "data"
TRAIN_DATA_PATH = PROCESSED_DATA_DIR / "train.json"
VAL_DATA_PATH = PROCESSED_DATA_DIR / "val.json"
TEST_DATA_PATH = PROCESSED_DATA_DIR / "test.json"

# Models and checkpoints
CHECKPOINT_PATH = POLICY_DIR / "policy_head.pt"
W2V_MODEL_PATH = ROOT_DIR / "evaluator" / "evaluator_w2v.model"

# Hyperparameters
WINDOW_SIZE = 4       # Context (last 3 sentences) + Candidate (1 sentence) = 4
EMBEDDING_DIM = 100   # Word2Vec dimensions
HIDDEN_LAYERS = [256, 64]
LEARNING_RATE = 1e-3
BATCH_SIZE = 64
EPOCHS = 30
PATIENCE = 5          # Early stopping patience
DROPOUT = 0.2

# Feature configuration
# Set to False to run the model on text embeddings only (suitable for cheap early pruning)
USE_SCALAR_FEATURES = False
NUM_SCALAR_FEATURES = 4  # boundary_score, local_coherence, global_coherence, makes_sense_score

# Random seed
SEED = 42
