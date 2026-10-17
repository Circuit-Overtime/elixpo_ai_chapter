"""Metrics used across architectures: BPC, val loss, sample sanity checks."""
from __future__ import annotations

import math
from typing import Iterable

import torch
import torch.nn.functional as F

from .tokenizer import BPETokenizer, EOW


def avg_chars_per_token(tokenizer: BPETokenizer, sample_ids: Iterable[int]) -> float:
    """Average decoded character length per BPE token id (EOW counts as space)."""
    ids = list(sample_ids)
    if not ids:
        return 0.0
    total = sum(len(tokenizer.itos[i].replace(EOW, " ")) for i in ids)
    return total / len(ids)


def bits_per_char(nats_per_token: float, chars_per_token: float) -> float:
    """Convert nats/token + chars/token → bits/char. The canonical comparable metric."""
    return (nats_per_token / max(chars_per_token, 1e-9)) / math.log(2)


@torch.no_grad()
def eval_loss(
    model,
    data: torch.Tensor,
    batch_size: int,
    block_size: int,
    n_batches: int,
    device: str = "cpu",
    use_hard: bool = False,
) -> float:
    """Evaluate cross-entropy loss on a random sample of val batches.

    `use_hard` toggles HDCRWKV.forward_hard() when applicable.
    """
    model.eval()
    losses = torch.zeros(n_batches)
    for k in range(n_batches):
        ix = torch.randint(0, len(data) - block_size - 1, (batch_size,))
        x = torch.stack([data[i : i + block_size] for i in ix]).to(device)
        y = torch.stack([data[i + 1 : i + 1 + block_size] for i in ix]).to(device)
        if use_hard and hasattr(model, "forward_hard"):
            _, loss = model.forward_hard(x, y)
        else:
            out = model(x, y)
            loss = out[1] if isinstance(out, tuple) else out
            # MoE returns (logits, (ce, lb), ...); peel off CE
            if isinstance(loss, tuple):
                loss = loss[0]
        losses[k] = loss.item()
    model.train()
    return losses.mean().item()
