"""Hybrid HDC-RWKV: binary recurrence + (continuous, int8-deployable) prototype.

The pure-binary HDC-RWKV in `hdc_rwkv.py` plateaus at BPC ~2.93 regardless of
scale (F13 in docs/findings.md). The bottleneck is the **bipolar
prototype-similarity output** — logits have bounded dynamic range that the
softmax cannot turn into the sharp distributions a real LM needs.

This module relaxes the OUTPUT projection to continuous values (int8 at
deployment), keeping everything else bipolar:

  vocab_hv      : bipolar (1 bit / dim)    ─┐ recurrence stays
  decay_mask    : bipolar (1 bit / dim)    ─┤ XOR-friendly for
  state         : continuous tanh in (-1,+1) ┤ ESP32/6502 inference
                                              │
  prototype_proj: int8 at deployment       ─┴ output becomes
                  (fp32 during training)       a real matmul

Deployment storage at V=256, d=512:
  vocab_hv  (binary): 16,384 B
  decay     (binary):    128 B per layer
  prototype (int8):   131,072 B
  ────────────────────────────────
  total:             ~148 KB  (fits ESP32 flash with massive headroom)
"""
from __future__ import annotations

import math
import torch
import torch.nn as nn
import torch.nn.functional as F

from ..config import HDCRWKVHybridConfig
from ..ste import ste_sign


class HDCRWKVHybrid(nn.Module):
    def __init__(self, cfg: HDCRWKVHybridConfig):
        super().__init__()
        self.cfg = cfg
        d = cfg.d
        V = cfg.vocab_size

        # ---- Binary (bipolar-at-inference) parameters ----
        self.vocab_hv_c = nn.Parameter(torch.randn(V, d) * 0.5)
        self.decay_masks_c = nn.ParameterList(
            [nn.Parameter(torch.full((d,), 0.5)) for _ in range(cfg.n_layers)]
        )

        # ---- Continuous prototype projection (int8 at deployment) ----
        # No STE — gradient flows directly. Initialised small so logits start near zero.
        self.prototype_proj = nn.Linear(d, V, bias=False)
        with torch.no_grad():
            self.prototype_proj.weight.normal_(0, 1.0 / math.sqrt(d))

        self.log_temp = nn.Parameter(torch.tensor(math.log(math.sqrt(d))))

    # ------------------------------------------------- forward (STE, training)
    def forward(
        self, idx: torch.Tensor, targets: torch.Tensor | None = None
    ) -> tuple[torch.Tensor, torch.Tensor | None]:
        B, T = idx.shape
        device = idx.device
        d = self.cfg.d

        vocab_bp = ste_sign(self.vocab_hv_c)
        tok_hv = vocab_bp[idx]
        rotated = torch.zeros_like(tok_hv)
        for t in range(T):
            rotated[:, t, :] = torch.roll(tok_hv[:, t, :], shifts=t, dims=-1)

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

        # Real prototype projection (NOT bipolar dot product)
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
        """Deployment-equivalent forward.

        - Binary params use real `.sign()`
        - Prototype projection optionally quantized to int8 with per-tensor scale
          to match the deployable binary format.
        """
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
            decay_bp = self.decay_masks_c[layer_idx].sign()
            state = torch.zeros(B, d, device=device)
            states = []
            for t in range(T):
                update = decay_bp * state + layer_input[:, t, :]
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

    # --------------------------------------------- int8 quantization helpers
    def quantize_prototype_int8(self) -> tuple[torch.Tensor, float]:
        """Per-tensor symmetric int8 quantization of the prototype matrix.

        Returns (int8_tensor, scale_float). At runtime:
            real_weight = int8_tensor.float() * scale
        """
        W = self.prototype_proj.weight.data
        max_abs = W.abs().max().item()
        scale = max_abs / 127.0 if max_abs > 0 else 1.0
        q = (W / scale).round().clamp(-128, 127).to(torch.int8)
        return q, scale

    # ---------------------------------------------- deployment byte counter
    def deployment_bytes(self) -> int:
        """Total bytes needed to deploy: bipolar bits for vocab+decay, int8 for prototype."""
        V, d, L = self.cfg.vocab_size, self.cfg.d, self.cfg.n_layers
        bipolar_bits = V * d + L * d
        bipolar_bytes = bipolar_bits // 8
        int8_bytes = V * d   # int8 prototype matrix
        return bipolar_bytes + int8_bytes
