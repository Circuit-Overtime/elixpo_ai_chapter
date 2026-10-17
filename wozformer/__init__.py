"""Wozformer: tiny language models for vintage silicon.

A research codebase combining HDC primitives, RWKV-style recurrence, and
gradient-trained binary weights — targeted for a 1 MHz 6502 with paged
external weight memory on an ESP32.

Submodules:
  config        — typed hyperparameter dataclasses
  data          — corpus loading + batching
  tokenizer     — BPE with end-of-word markers, persistable to JSON
  ste           — straight-through estimator
  utils         — set_seed, log_info, device picker, param counter
  trainer       — generic best-val training loop
  generate      — autoregressive sampling with temperature + top-k
  metrics       — bits-per-char and eval helpers
  distillation  — teacher → student KL training (the paper centerpiece)
  models        — TinyTransformer, TinyMoETransformer, RWKVModel, HDCModel, HDCRWKV
"""
from __future__ import annotations

from . import config
from . import data
from . import tokenizer
from . import ste
from . import utils
from . import trainer
from . import generate
from . import metrics
from . import distillation
from . import models

__all__ = [
    "config",
    "data",
    "tokenizer",
    "ste",
    "utils",
    "trainer",
    "generate",
    "metrics",
    "distillation",
    "models",
]

__version__ = "0.1.0"
