"""RWKV-style linear-recurrence LM (nb10).

No KV cache, no softmax-over-T. State stays in a fixed-size vector updated per token.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from ..config import RWKVConfig


class TimeMixing(nn.Module):
    """Replaces attention: linear recurrence with learned per-channel decay."""

    def __init__(self, d_model: int):
        super().__init__()
        self.W_r = nn.Linear(d_model, d_model, bias=False)
        self.W_k = nn.Linear(d_model, d_model, bias=False)
        self.W_v = nn.Linear(d_model, d_model, bias=False)
        self.W_o = nn.Linear(d_model, d_model, bias=False)
        # decay_actual = exp(-exp(time_decay)) ∈ (0, 1)
        self.time_decay = nn.Parameter(torch.zeros(d_model))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        r = torch.sigmoid(self.W_r(x))
        k = self.W_k(x).clamp(max=5.0)
        v = self.W_v(x)
        decay = torch.exp(-torch.exp(self.time_decay))

        B, T, D = k.shape
        state_a = torch.zeros(B, D, device=x.device, dtype=x.dtype)
        state_b = torch.zeros(B, D, device=x.device, dtype=x.dtype)
        ek = torch.exp(k)
        outs = []
        for t in range(T):
            state_a = state_a * decay + ek[:, t, :] * v[:, t, :]
            state_b = state_b * decay + ek[:, t, :]
            outs.append(state_a / (state_b + 1e-6))
        wkv = torch.stack(outs, dim=1)
        return self.W_o(r * wkv)


class ChannelMixing(nn.Module):
    """Replaces MLP: gated squared-ReLU."""

    def __init__(self, d_model: int, d_inner: int):
        super().__init__()
        self.W_r = nn.Linear(d_model, d_model, bias=False)
        self.W_k = nn.Linear(d_model, d_inner, bias=False)
        self.W_v = nn.Linear(d_inner, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        r = torch.sigmoid(self.W_r(x))
        k = torch.relu(self.W_k(x)).pow(2)
        return r * self.W_v(k)


class _RWKVBlock(nn.Module):
    def __init__(self, d_model: int, d_inner_cm: int):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.tm = TimeMixing(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        self.cm = ChannelMixing(d_model, d_inner_cm)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.tm(self.ln1(x))
        x = x + self.cm(self.ln2(x))
        return x


class RWKVModel(nn.Module):
    """No positional embedding: recurrence encodes position natively."""

    def __init__(self, cfg: RWKVConfig):
        super().__init__()
        self.cfg = cfg
        self.token_embed = nn.Embedding(cfg.vocab_size, cfg.d_model)
        self.blocks = nn.ModuleList(
            [_RWKVBlock(cfg.d_model, cfg.d_inner_cm) for _ in range(cfg.n_layers)]
        )
        self.ln_final = nn.LayerNorm(cfg.d_model)
        self.lm_head = nn.Linear(cfg.d_model, cfg.vocab_size)

    def forward(
        self, idx: torch.Tensor, targets: torch.Tensor | None = None
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        B, T = idx.shape
        x = self.token_embed(idx)
        for block in self.blocks:
            x = block(x)
        x = self.ln_final(x)
        logits = self.lm_head(x)
        if targets is None:
            return logits, None
        loss = F.cross_entropy(logits.view(B * T, -1), targets.view(B * T))
        return logits, loss
