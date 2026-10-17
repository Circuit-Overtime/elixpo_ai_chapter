import os
from pathlib import Path

# Base directories
EVALUATOR_DIR = Path(__file__).resolve().parent
ROOT_DIR = EVALUATOR_DIR.parent

# Dataset paths
SALES_RAW_PATH = ROOT_DIR / "sales_dataset.txt"
NEWTON_RAW_PATH = ROOT_DIR / "newton_dataset.txt"

# Processed data output
PROCESSED_DATA_DIR = EVALUATOR_DIR / "data"
TRAIN_DATA_PATH = PROCESSED_DATA_DIR / "train.json"
VAL_DATA_PATH = PROCESSED_DATA_DIR / "val.json"
TEST_DATA_PATH = PROCESSED_DATA_DIR / "test.json"

# Models and checkpoints
CHECKPOINT_PATH = EVALUATOR_DIR / "makes_sense_evaluator.pt"
W2V_MODEL_PATH = EVALUATOR_DIR / "evaluator_w2v.model"

# Hyperparameters
WINDOW_SIZE = 4       # Trajectory length (K sentences)
EMBEDDING_DIM = 100   # Match Word2Vec dimension
HIDDEN_LAYERS = [512, 128]
LEARNING_RATE = 1e-3
BATCH_SIZE = 64
EPOCHS = 30
PATIENCE = 5          # Early stopping patience
DROPOUT = 0.2

# Random seed for training/splits
SEED = 42
