"""Dense transformer (nb05/nb07b) — the teacher candidate for distillation."""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from ..config import TransformerConfig


class _Head(nn.Module):
    def __init__(self, embed_dim: int, head_size: int, block_size: int, dropout: float = 0.0):
        super().__init__()
        self.key = nn.Linear(embed_dim, head_size, bias=False)
        self.query = nn.Linear(embed_dim, head_size, bias=False)
        self.value = nn.Linear(embed_dim, head_size, bias=False)
        self.register_buffer("tril", torch.tril(torch.ones(block_size, block_size)))
        self.head_size = head_size
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, _ = x.shape
        k, q, v = self.key(x), self.query(x), self.value(x)
        scores = q @ k.transpose(-2, -1) / (self.head_size ** 0.5)
        scores = scores.masked_fill(self.tril[:T, :T] == 0, float("-inf"))
        weights = self.dropout(F.softmax(scores, dim=-1))
        return weights @ v


class _MultiHead(nn.Module):
    def __init__(self, embed_dim: int, num_heads: int, block_size: int, dropout: float = 0.0):
        super().__init__()
        assert embed_dim % num_heads == 0
        head_size = embed_dim // num_heads
        self.heads = nn.ModuleList(
            [_Head(embed_dim, head_size, block_size, dropout) for _ in range(num_heads)]
        )
        self.proj = nn.Linear(embed_dim, embed_dim)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = torch.cat([h(x) for h in self.heads], dim=-1)
        return self.dropout(self.proj(out))


class _FeedForward(nn.Module):
    def __init__(self, embed_dim: int, mult: int = 2, dropout: float = 0.0):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(embed_dim, mult * embed_dim),
            nn.ReLU(),
            nn.Linear(mult * embed_dim, embed_dim),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class _Block(nn.Module):
    def __init__(self, embed_dim: int, num_heads: int, block_size: int, mult: int, dropout: float = 0.0):
        super().__init__()
        self.ln1 = nn.LayerNorm(embed_dim)
        self.attn = _MultiHead(embed_dim, num_heads, block_size, dropout)
        self.ln2 = nn.LayerNorm(embed_dim)
        self.mlp = _FeedForward(embed_dim, mult=mult, dropout=dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(self.ln1(x))
        x = x + self.mlp(self.ln2(x))
        return x


class TinyTransformer(nn.Module):
    """Pre-norm causal transformer for autoregressive LM."""

    def __init__(self, cfg: TransformerConfig, block_size: int):
        super().__init__()
        self.block_size = block_size
        self.token_embed = nn.Embedding(cfg.vocab_size, cfg.d_model)
        self.pos_embed = nn.Embedding(block_size, cfg.d_model)
        self.embed_dropout = nn.Dropout(cfg.dropout)
        self.blocks = nn.Sequential(
            *[
                _Block(cfg.d_model, cfg.num_heads, block_size, cfg.mlp_mult, cfg.dropout)
                for _ in range(cfg.n_layers)
            ]
        )
        self.ln_final = nn.LayerNorm(cfg.d_model)
        self.lm_head = nn.Linear(cfg.d_model, cfg.vocab_size)
        self.cfg = cfg

    def forward(
        self, idx: torch.Tensor, targets: torch.Tensor | None = None
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        B, T = idx.shape
        x = self.token_embed(idx) + self.pos_embed(torch.arange(T, device=idx.device))
        x = self.embed_dropout(x)
        x = self.blocks(x)
        x = self.ln_final(x)
        logits = self.lm_head(x)
        if targets is None:
            return logits, None
        loss = F.cross_entropy(
            logits.view(B * T, -1), targets.view(B * T)
        )
        return logits, loss
