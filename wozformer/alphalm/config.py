import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent

# Corpus settings
CORPUS_PATH = BASE_DIR / "sales_dataset.txt"

# Text quilting / boundary settings
BOUNDARY_SIZE = 2  # Number of words at suffix/prefix to match

# Word2Vec settings
W2V_VECTOR_SIZE = 100
W2V_WINDOW = 5
W2V_MIN_COUNT = 1
W2V_EPOCHS = 20

# spaCy configuration
SPACY_MODEL = "en_core_web_sm"

# Generation / Search settings
DEFAULT_NUM_SENTENCES = 8
ALLOW_REUSE = False
DEFAULT_BEAM_WIDTH = 5
GLOBAL_WINDOW_SIZE = 3

# Composite scoring weights (tuned via HYPERPARAMS_BEST.ods — +10.7 overall improvement)
WEIGHT_BOUNDARY = 1.0
WEIGHT_LOCAL = 3.0
WEIGHT_GLOBAL = 3.0
WEIGHT_COMPLETION = 0.0  # Set to 0.0 for v3
WEIGHT_MAKES_SENSE = 3.0  # v5.5 Deep Makes-Sense v2
WEIGHT_POLICY = 1.0  # v5.5 Policy Head
WEIGHT_VALIDITY = 1.5  # v5.5 Sentence Validity

# Repetition Penalty weights (v5.5.3, tuned via HYPERPARAMS_BEST.ods)
WEIGHT_SENTENCE_REP   = 1.0    # Hard duplicate gate
WEIGHT_SEMANTIC_REP   = 0.25   # Paraphrase-level repetition penalty
WEIGHT_TOPIC_REP      = 2.25   # Topic centroid drift penalty (most important)
WEIGHT_TOPIC_PROGRESS = 0.5    # Exploration bonus (subtracted from penalty)

# Learned evaluator settings
EVALUATOR_PATH = BASE_DIR / "evaluator" / "makes_sense_evaluator.pt"
POLICY_PATH = BASE_DIR / "policy" / "policy_head.pt"
MAKES_SENSE_V2_PATH = BASE_DIR / "models" / "makes_sense_v2.pt"
SENTENCE_VALIDITY_PATH = BASE_DIR / "models" / "sentence_validity.pt"
MAKES_SENSE_V2_1_PATH = BASE_DIR / "models" / "makes_sense_v2_1.pt"
SENTENCE_VALIDITY_V2_PATH = BASE_DIR / "models" / "sentence_validity_v2.pt"
MAKES_SENSE_TRANSFORMER_PATH = BASE_DIR / "models" / "makes_sense_tinystories_transformer.pt"
SENTENCE_VALIDITY_TRANSFORMER_PATH = BASE_DIR / "models" / "validity_tinystories_transformer.pt"

# Random seed for reproducibility
SEED = 42


