"""Mixture-of-Experts transformer (nb09) with top-1 routing and Switch-style load balance."""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from ..config import MoEConfig


class _Head(nn.Module):
    def __init__(self, embed_dim: int, head_size: int, block_size: int):
        super().__init__()
        self.key = nn.Linear(embed_dim, head_size, bias=False)
        self.query = nn.Linear(embed_dim, head_size, bias=False)
        self.value = nn.Linear(embed_dim, head_size, bias=False)
        self.register_buffer("tril", torch.tril(torch.ones(block_size, block_size)))
        self.head_size = head_size

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, _ = x.shape
        k, q, v = self.key(x), self.query(x), self.value(x)
        scores = q @ k.transpose(-2, -1) / (self.head_size ** 0.5)
        scores = scores.masked_fill(self.tril[:T, :T] == 0, float("-inf"))
        return F.softmax(scores, dim=-1) @ v


class _MultiHead(nn.Module):
    def __init__(self, embed_dim: int, num_heads: int, block_size: int):
        super().__init__()
        head_size = embed_dim // num_heads
        self.heads = nn.ModuleList(
            [_Head(embed_dim, head_size, block_size) for _ in range(num_heads)]
        )
        self.proj = nn.Linear(embed_dim, embed_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.proj(torch.cat([h(x) for h in self.heads], dim=-1))


class MoEMLP(nn.Module):
    """N small experts + a router. Top-1 hard routing at inference; soft mixing during train."""

    def __init__(self, d_model: int, n_experts: int, expert_inner: int):
        super().__init__()
        self.n_experts = n_experts
        self.router = nn.Linear(d_model, n_experts, bias=False)
        self.experts = nn.ModuleList(
            [
                nn.Sequential(
                    nn.Linear(d_model, expert_inner),
                    nn.ReLU(),
                    nn.Linear(expert_inner, d_model),
                )
                for _ in range(n_experts)
            ]
        )

    def forward(self, x: torch.Tensor, hard: bool = False):
        router_logits = self.router(x)
        router_probs = F.softmax(router_logits, dim=-1)
        if hard:
            top1 = router_probs.argmax(dim=-1)
            out = torch.zeros_like(x)
            for e in range(self.n_experts):
                mask = (top1 == e).unsqueeze(-1).float()
                if mask.sum() == 0:
                    continue
                out = out + mask * self.experts[e](x)
        else:
            expert_outs = torch.stack([e(x) for e in self.experts], dim=-2)
            out = (router_probs.unsqueeze(-1) * expert_outs).sum(dim=-2)
        return out, router_probs


def load_balance_loss(router_probs: torch.Tensor) -> torch.Tensor:
    """Switch Transformer auxiliary: minimised when expert usage is uniform."""
    n = router_probs.shape[-1]
    top1 = router_probs.argmax(dim=-1)
    f = torch.zeros(n, device=router_probs.device)
    for e in range(n):
        f[e] = (top1 == e).float().mean()
    p = router_probs.mean(dim=(0, 1))
    return n * (f * p).sum()


class _MoEBlock(nn.Module):
    def __init__(self, cfg: MoEConfig, block_size: int):
        super().__init__()
        self.ln1 = nn.LayerNorm(cfg.d_model)
        self.attn = _MultiHead(cfg.d_model, cfg.num_heads, block_size)
        self.ln2 = nn.LayerNorm(cfg.d_model)
        self.moe = MoEMLP(cfg.d_model, cfg.n_experts, cfg.expert_inner)

    def forward(self, x: torch.Tensor, hard: bool = False):
        x = x + self.attn(self.ln1(x))
        moe_out, router_probs = self.moe(self.ln2(x), hard=hard)
        x = x + moe_out
        return x, router_probs


class TinyMoETransformer(nn.Module):
    def __init__(self, cfg: MoEConfig, block_size: int):
        super().__init__()
        self.block_size = block_size
        self.cfg = cfg
        self.token_embed = nn.Embedding(cfg.vocab_size, cfg.d_model)
        self.pos_embed = nn.Embedding(block_size, cfg.d_model)
        self.blocks = nn.ModuleList(
            [_MoEBlock(cfg, block_size) for _ in range(cfg.n_layers)]
        )
        self.ln_final = nn.LayerNorm(cfg.d_model)
        self.lm_head = nn.Linear(cfg.d_model, cfg.vocab_size)

    def forward(
        self,
        idx: torch.Tensor,
        targets: torch.Tensor | None = None,
        hard: bool = False,
    ):
        B, T = idx.shape
        x = self.token_embed(idx) + self.pos_embed(torch.arange(T, device=idx.device))
        all_router_probs = []
        for block in self.blocks:
            x, rp = block(x, hard=hard)
            all_router_probs.append(rp)
        x = self.ln_final(x)
        logits = self.lm_head(x)
        if targets is None:
            return logits, None, all_router_probs
        ce = F.cross_entropy(logits.view(B * T, -1), targets.view(B * T))
        lb = sum(load_balance_loss(rp) for rp in all_router_probs) / len(all_router_probs)
        return logits, (ce, lb), all_router_probs
