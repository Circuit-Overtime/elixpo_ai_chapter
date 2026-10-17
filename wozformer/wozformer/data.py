"""Corpus loading + train/val splitting.

Tiny Shakespeare is the default corpus, but the interface accepts any
character-level text file. Splits chronologically (last 10% = val) to avoid
neighbouring chunks leaking across the split.
"""
from __future__ import annotations

from pathlib import Path
from typing import Tuple

import torch

from .utils import log_info


def load_corpus(path: str | Path, lowercase: bool = True) -> str:
    """Read a plain-text corpus from disk. Returns the (optionally lowercased) string."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Corpus file not found: {p}")
    log_info(f"Loading corpus from {p}")
    text = p.read_text(encoding="utf-8", errors="ignore")
    text = text.replace("\r\n", "\n").strip()
    if lowercase:
        text = text.lower()
    log_info(f"Loaded {len(text):,} characters")
    return text


def split_train_val(
    ids: torch.Tensor, val_fraction: float = 0.1
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Chronologically split a 1D tensor of token IDs into (train, val).

    Last `val_fraction` of the tensor becomes the validation set. We do NOT
    shuffle — neighbouring positions in Tiny Shakespeare share play context,
    so a random split would leak.
    """
    if ids.dim() != 1:
        raise ValueError(f"Expected 1D tensor of token IDs, got shape {tuple(ids.shape)}")
    cut = int((1.0 - val_fraction) * len(ids))
    return ids[:cut], ids[cut:]


def make_batch(
    data: torch.Tensor,
    batch_size: int,
    block_size: int,
    device: str = "cpu",
) -> Tuple[torch.Tensor, torch.Tensor]:
    """Sample a (B, T) input + (B, T) target batch for next-token prediction.

    `target[b, t] == input[b, t+1]` (the standard shift-by-one trick).
    """
    n = len(data) - block_size - 1
    ix = torch.randint(0, n, (batch_size,))
    x = torch.stack([data[i : i + block_size] for i in ix])
    y = torch.stack([data[i + 1 : i + 1 + block_size] for i in ix])
    return x.to(device), y.to(device)
