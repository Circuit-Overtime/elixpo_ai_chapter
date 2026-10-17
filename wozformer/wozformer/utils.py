"""Utility helpers used everywhere: seeding, logging, device selection."""
from __future__ import annotations

import random
import sys

import numpy as np
import torch


def set_seed(seed: int) -> None:
    """Set seeds across Python, NumPy, and PyTorch (CPU + CUDA) for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def get_device(prefer_cuda: bool = True) -> str:
    """Return 'cuda' if available and preferred, else 'cpu'. Single source of truth."""
    if prefer_cuda and torch.cuda.is_available():
        return "cuda"
    return "cpu"


def log_info(msg: str) -> None:
    """One-line info log. Equivalent to `print` but tagged so it's easy to grep."""
    print(f"[INFO] {msg}", file=sys.stderr, flush=True)


def log_debug(msg: str) -> None:
    """One-line debug log."""
    print(f"[DEBUG] {msg}", file=sys.stderr, flush=True)


def count_params(model: torch.nn.Module, only_trainable: bool = True) -> int:
    """Total parameters in a torch model."""
    if only_trainable:
        return sum(p.numel() for p in model.parameters() if p.requires_grad)
    return sum(p.numel() for p in model.parameters())
