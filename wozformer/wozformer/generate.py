"""Autoregressive sampling with temperature + top-k filtering."""
from __future__ import annotations

from typing import Optional

import torch
import torch.nn.functional as F

from .tokenizer import BPETokenizer


@torch.no_grad()
def generate(
    model: torch.nn.Module,
    tokenizer: BPETokenizer,
    prompt: str = "",
    max_new_tokens: int = 120,
    block_size: int = 16,
    temperature: float = 0.6,
    top_k: int = 5,
    seed: Optional[int] = None,
    device: str = "cpu",
    use_hard: bool = True,
) -> str:
    """Sample max_new_tokens tokens from `model`, decode, return the full string.

    Reproducibility: pass `seed` for bit-identical output across runs.

    Notes:
      - If model has `forward_hard` and `use_hard` is True, the deployment forward
        pass is used (real .sign() for bipolar models). This matches what the 6502
        actually computes.
      - top_k=0 disables filtering.
    """
    if seed is not None:
        torch.manual_seed(seed)
        if device == "cuda":
            torch.cuda.manual_seed_all(seed)

    model.eval()
    ids = tokenizer.encode(prompt) if prompt else [1]
    idx = torch.tensor([ids], dtype=torch.long, device=device)

    for _ in range(max_new_tokens):
        idx_cond = idx[:, -block_size:]
        if use_hard and hasattr(model, "forward_hard"):
            logits, _ = model.forward_hard(idx_cond)
        else:
            out = model(idx_cond)
            logits = out[0] if isinstance(out, tuple) else out

        last = logits[:, -1, :] / temperature

        if top_k > 0:
            top_vals, top_idxs = last.topk(top_k, dim=-1)
            mask = torch.full_like(last, float("-inf"))
            mask.scatter_(-1, top_idxs, top_vals)
            last = mask

        probs = F.softmax(last, dim=-1)
        nxt = torch.multinomial(probs, num_samples=1)
        idx = torch.cat([idx, nxt], dim=1)

    return tokenizer.decode(idx[0].tolist())
