"""Pure HDC autoregressive LM (nb11): random vocab + Hebbian prototype training.

Not gradient-trained. One pass over the corpus accumulates context hypervectors
into per-token prototypes. Inference is Hamming-distance similarity to prototypes.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F

from ..config import HDCConfig


def random_hv(d: int, seed: int | None = None, device: str = "cpu") -> torch.Tensor:
    """Bipolar random hypervector of dimension d (each component in {-1, +1})."""
    if seed is not None:
        g = torch.Generator(device=device)
        g.manual_seed(seed)
        bits = torch.randint(0, 2, (d,), generator=g, device=device).float()
    else:
        bits = torch.randint(0, 2, (d,), device=device).float()
    return bits * 2 - 1


def build_vocab_hv(cfg: HDCConfig, device: str = "cpu") -> torch.Tensor:
    """Deterministic per-token hypervector table seeded from cfg.vocab_seed."""
    table = torch.empty(cfg.vocab_size, cfg.D, device=device)
    for i in range(cfg.vocab_size):
        table[i] = random_hv(cfg.D, seed=cfg.vocab_seed + i, device=device)
    return table


def encode_context_batch(
    token_ids: torch.Tensor, vocab_hv: torch.Tensor, T: int
) -> torch.Tensor:
    """Encode (B, T) token IDs into (B, D) context hypervectors via permute+sum+sign."""
    B = token_ids.shape[0]
    D = vocab_hv.shape[1]
    out = torch.zeros(B, D, device=vocab_hv.device)
    hvs = vocab_hv[token_ids]  # (B, T, D)
    for k in range(T):
        out += torch.roll(hvs[:, k, :], shifts=k, dims=-1)
    return out.sign()


class HDCModel:
    """Function-style HDC LM (no nn.Module — no gradients in this architecture)."""

    def __init__(self, cfg: HDCConfig, vocab_hv: torch.Tensor, prototypes: torch.Tensor):
        self.cfg = cfg
        self.vocab_hv = vocab_hv         # (V, D), bipolar
        self.prototypes = prototypes     # (V, D), bipolar

    @classmethod
    def train_hebbian(
        cls,
        cfg: HDCConfig,
        train_ids: torch.Tensor,
        device: str = "cpu",
        batch_size: int = 4096,
    ) -> "HDCModel":
        """One pass over `train_ids`: accumulate context hypervectors into per-target prototypes."""
        vocab_hv = build_vocab_hv(cfg, device=device)
        accumulator = torch.zeros(cfg.vocab_size, cfg.D, device=device)
        train_ids = train_ids.to(device)
        N = len(train_ids) - cfg.T
        for start in range(0, N, batch_size):
            end = min(start + batch_size, N)
            idx = torch.arange(start, end, device=device)
            contexts = torch.stack([train_ids[i : i + cfg.T] for i in idx.tolist()])
            targets = train_ids[idx + cfg.T]
            ctx_hv = encode_context_batch(contexts, vocab_hv, cfg.T)
            accumulator.index_add_(0, targets, ctx_hv)
        prototypes = accumulator.sign()
        prototypes[prototypes == 0] = 1.0
        return cls(cfg=cfg, vocab_hv=vocab_hv, prototypes=prototypes)

    def predict(self, context_ids: torch.Tensor, temperature: float = 1.0) -> torch.Tensor:
        """Return softmax-normalised probability distribution over next token."""
        if context_ids.dim() == 1:
            context_ids = context_ids.unsqueeze(0)
        ctx_hv = encode_context_batch(context_ids[:, -self.cfg.T :], self.vocab_hv, self.cfg.T)
        sims = (self.prototypes @ ctx_hv.t()).t() / self.cfg.D
        return F.softmax(sims / temperature, dim=-1)
