"""HDC-RWKV with continuous decay + int8 prototype (F15 test variant).

Background: F13 showed pure-binary HDC-RWKV plateaus at BPC ~2.93 regardless
of scale. F14 showed relaxing the prototype to int8 doesn't help — the output
projection was NOT the bottleneck. F15 hypothesises the bipolar **decay_mask**
in the recurrence is the actual limit (forces each channel into binary
keep-or-flip memory, preventing the continuous-decay multi-horizon patterns
that real RWKV uses).

Architecture changes relative to HDCRWKVHybrid:

  vocab_hv     : bipolar (1 bit / dim)            unchanged
  decay        : CONTINUOUS (sigmoid ∈ (0, 1))    F15 change
  state        : continuous tanh in (-1, +1)      unchanged
  prototype    : int8 at deployment               unchanged

Deployment storage at V=256, d=512:

  vocab_hv  (bipolar) : 16,384 B
  decay     (fp16)    :   1,024 B  per layer  (negligible vs Tier 2.5's bipolar 64 B)
  prototype (int8)    : 131,072 B
  ──────────────────────────────────────────────
  total              : ~149 KB  (essentially same as Tier 2.5)

If this notebook breaks BPC below ~2.5, the bipolar decay was the bottleneck
and the paper has a clean mechanism story. If BPC stays at 2.93, the ceiling
is architectural-family-wide and no single component relaxation breaks it.
"""
from __future__ import annotations

import math
import torch
import torch.nn as nn
import torch.nn.functional as F

from ..config import HDCRWKVContinuousDecayConfig
from ..ste import ste_sign


class HDCRWKVContinuousDecay(nn.Module):
    def __init__(self, cfg: HDCRWKVContinuousDecayConfig):
        super().__init__()
        self.cfg = cfg
        d = cfg.d
        V = cfg.vocab_size

        # ---- Bipolar vocab (binary at deployment) ----
        self.vocab_hv_c = nn.Parameter(torch.randn(V, d) * 0.5)

        # ---- CONTINUOUS decay: logits → sigmoid ∈ (0, 1) per channel ----
        # Initialise around sigmoid(2) ≈ 0.88 so the model starts with "mostly
        # keep memory" behaviour, similar to RWKV's default decay init.
        self.decay_logits = nn.ParameterList(
            [nn.Parameter(torch.full((d,), 2.0)) for _ in range(cfg.n_layers)]
        )

        # ---- Continuous prototype projection (int8 at deployment) ----
        self.prototype_proj = nn.Linear(d, V, bias=False)
        with torch.no_grad():
            self.prototype_proj.weight.normal_(0, 1.0 / math.sqrt(d))

        self.log_temp = nn.Parameter(torch.tensor(math.log(math.sqrt(d))))

    # --------------------------------------------------------- forward (train)
    def forward(
        self, idx: torch.Tensor, targets: torch.Tensor | None = None
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        B, T = idx.shape
        device = idx.device
        d = self.cfg.d

        # vocab still bipolar via STE
        vocab_bp = ste_sign(self.vocab_hv_c)
        tok_hv = vocab_bp[idx]
        rotated = torch.zeros_like(tok_hv)
        for t in range(T):
            rotated[:, t, :] = torch.roll(tok_hv[:, t, :], shifts=t, dims=-1)

        layer_input = rotated
        for layer_idx in range(self.cfg.n_layers):
            # CONTINUOUS decay ∈ (0, 1) — each channel learns its own decay rate
            decay = torch.sigmoid(self.decay_logits[layer_idx])
            state = torch.zeros(B, d, device=device)
            states = []
            for t in range(T):
                update = decay * state + layer_input[:, t, :]
                state = torch.tanh(update)
                states.append(state)
            layer_input = torch.stack(states, dim=1)

        temp = self.log_temp.exp()
        logits = self.prototype_proj(layer_input) / temp

        if targets is None:
            return logits, None
        loss = F.cross_entropy(logits.view(B * T, -1), targets.view(B * T))
        return logits, loss

    # --------------------------------- hard forward (deployment-equivalent)
    @torch.no_grad()
    def forward_hard(
        self,
        idx: torch.Tensor,
        targets: torch.Tensor | None = None,
        quantize_prototype: bool = True,
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        """Deployment forward: vocab .sign(), decay continuous (unchanged), prototype int8."""
        B, T = idx.shape
        d = self.cfg.d
        device = idx.device

        vocab_bp = self.vocab_hv_c.sign()
        tok_hv = vocab_bp[idx]
        rotated = torch.zeros_like(tok_hv)
        for t in range(T):
            rotated[:, t, :] = torch.roll(tok_hv[:, t, :], shifts=t, dims=-1)

        layer_input = rotated
        for layer_idx in range(self.cfg.n_layers):
            decay = torch.sigmoid(self.decay_logits[layer_idx])
            state = torch.zeros(B, d, device=device)
            states = []
            for t in range(T):
                update = decay * state + layer_input[:, t, :]
                state = torch.tanh(update)
                states.append(state)
            layer_input = torch.stack(states, dim=1)

        if quantize_prototype:
            proto_q, scale = self.quantize_prototype_int8()
            proto_real = proto_q.to(torch.float32) * scale
        else:
            proto_real = self.prototype_proj.weight.data

        temp = self.log_temp.exp()
        logits = (layer_input @ proto_real.t()) / temp

        if targets is None:
            return logits, None
        loss = F.cross_entropy(logits.view(B * T, -1), targets.view(B * T))
        return logits, loss

    # --------------------------------------------- int8 prototype quantization
    def quantize_prototype_int8(self) -> tuple[torch.Tensor, float]:
        W = self.prototype_proj.weight.data
        max_abs = W.abs().max().item()
        scale = max_abs / 127.0 if max_abs > 0 else 1.0
        q = (W / scale).round().clamp(-128, 127).to(torch.int8)
        return q, scale

    # ----------------------------------------------- deployment byte counter
    def deployment_bytes(self) -> int:
        """Bipolar vocab + fp16 decay + int8 prototype."""
        V, d, L = self.cfg.vocab_size, self.cfg.d, self.cfg.n_layers
        bipolar_bytes = (V * d) // 8         # vocab_hv
        decay_bytes   = L * d * 2            # fp16 decay
        int8_bytes    = V * d                # prototype int8
        return bipolar_bytes + decay_bytes + int8_bytes
