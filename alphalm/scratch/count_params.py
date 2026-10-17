import torch
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.append(str(BASE_DIR))

from models.makes_sense_v2 import DeepMakesSenseEvaluatorV2
from models.sentence_validity import SentenceValidityEvaluator
from models.sentence_validity import SentenceValidityBiGRU

def count_parameters(model):
    total = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return total, trainable

# Load Makes Sense v2
makes_sense_eval = DeepMakesSenseEvaluatorV2()
ms_total, ms_trainable = count_parameters(makes_sense_eval.model)
print(f"Deep Makes-Sense v2 - Total parameters: {ms_total:,}, Trainable: {ms_trainable:,}")

# Load Sentence Validity Head
validity_eval = SentenceValidityEvaluator()
val_total, val_trainable = count_parameters(validity_eval.model)
print(f"Sentence Validity Head - Total parameters: {val_total:,}, Trainable: {val_trainable:,}")

# Let's count without embedding layer since embedding layer is initialized with word2vec
# (which might or might not be frozen, freeze_emb in SentenceValidityBiGRU init defaults to False, but we can verify)
print(f"Is validity embedding frozen? {not validity_eval.model.embedding.weight.requires_grad}")
embedding_params = validity_eval.model.embedding.weight.numel()
print(f"Validity Embedding parameters: {embedding_params:,}")
print(f"Validity (excluding Embedding) parameters: {val_total - embedding_params:,}")
