"""HDC-RWKV (nb12c) — the shipping architecture.

Bipolar gradient-trainable recurrent LM:
- Vocab and prototype hypervectors are learned, materialised via STE → bipolar
- Position via cyclic rotation
- State is continuous (tanh) but bounded — no NaN possible at inference
- Output via prototype similarity

This is the architecture targeted for distillation from the dense transformer
teacher and for paged deployment on the 6502.
"""
from __future__ import annotations

import math
import torch
import torch.nn as nn
import torch.nn.functional as F

from ..config import HDCRWKVConfig
from ..ste import ste_sign


class HDCRWKV(nn.Module):
    def __init__(self, cfg: HDCRWKVConfig):
        super().__init__()
        self.cfg = cfg
        d = cfg.d
        V = cfg.vocab_size

        self.vocab_hv_c = nn.Parameter(torch.randn(V, d) * 0.5)
        self.prototype_hv_c = nn.Parameter(torch.randn(V, d) * 0.5)
        # One decay mask per recurrent layer
        self.decay_masks_c = nn.ParameterList(
            [nn.Parameter(torch.full((d,), 0.5)) for _ in range(cfg.n_layers)]
        )
        self.log_temp = nn.Parameter(torch.tensor(math.log(math.sqrt(d))))

    # ------------------------------------------------------- forward (soft, STE)
    def forward(
        self, idx: torch.Tensor, targets: torch.Tensor | None = None
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        B, T = idx.shape
        device = idx.device
        d = self.cfg.d

        vocab_bp = ste_sign(self.vocab_hv_c)
        proto_bp = ste_sign(self.prototype_hv_c)

        # Position-dependent rotation on token hypervectors
        tok_hv = vocab_bp[idx]
        rotated = torch.zeros_like(tok_hv)
        for t in range(T):
            rotated[:, t, :] = torch.roll(tok_hv[:, t, :], shifts=t, dims=-1)

        # Recurrence per layer with continuous tanh state
        layer_input = rotated
        for layer_idx in range(self.cfg.n_layers):
            decay_bp = ste_sign(self.decay_masks_c[layer_idx])
            state = torch.zeros(B, d, device=device)
            states = []
            for t in range(T):
                update = decay_bp * state + layer_input[:, t, :]
                state = torch.tanh(update)
                states.append(state)
            layer_input = torch.stack(states, dim=1)

        # Prototype similarity → logits
        temp = self.log_temp.exp()
        logits = (layer_input @ proto_bp.t()) / temp

        if targets is None:
            return logits, None
        loss = F.cross_entropy(logits.view(B * T, -1), targets.view(B * T))
        return logits, loss

    # ------------------------------- hard forward (deployment-equivalent)
    @torch.no_grad()
    def forward_hard(
        self, idx: torch.Tensor, targets: torch.Tensor | None = None
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        """Real .sign() everywhere — what the 6502 will compute. Same shape as forward()."""
        B, T = idx.shape
        d = self.cfg.d
        device = idx.device

        vocab_bp = self.vocab_hv_c.sign()
        proto_bp = self.prototype_hv_c.sign()

        tok_hv = vocab_bp[idx]
        rotated = torch.zeros_like(tok_hv)
        for t in range(T):
            rotated[:, t, :] = torch.roll(tok_hv[:, t, :], shifts=t, dims=-1)

        layer_input = rotated
        for layer_idx in range(self.cfg.n_layers):
            decay_bp = self.decay_masks_c[layer_idx].sign()
            state = torch.zeros(B, d, device=device)
            states = []
            for t in range(T):
                update = decay_bp * state + layer_input[:, t, :]
                state = torch.tanh(update)
                states.append(state)
            layer_input = torch.stack(states, dim=1)

        temp = self.log_temp.exp()
        logits = (layer_input @ proto_bp.t()) / temp

        if targets is None:
            return logits, None
        loss = F.cross_entropy(logits.view(B * T, -1), targets.view(B * T))
        return logits, loss

    # ----------------------------------------------------- deployment bytes
    def deployment_bytes(self) -> int:
        """Bipolar storage at inference: 1 bit per dim."""
        V, d, L = self.cfg.vocab_size, self.cfg.d, self.cfg.n_layers
        return (V * d + V * d + L * d) // 8
