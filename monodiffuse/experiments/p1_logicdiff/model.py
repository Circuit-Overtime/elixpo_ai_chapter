"""Minimal differentiable logic-gate network (P1 feasibility).

A self-contained, dependency-light reimplementation of the core mechanism from
Differentiable Logic Gate Networks (Petersen et al., NeurIPS 2022). Each logic
neuron takes two inputs a, b in [0,1] (relaxed booleans), and outputs a softmax-
weighted mixture over the 16 binary boolean functions, each given a continuous
multilinear relaxation. Training is gradient-based over the gate-choice logits;
at inference the argmax gate makes the network pure logic (no arithmetic).

We roll our own (rather than the official CUDA `difflogic` package) so P1 runs on
CPU or GPU with no build step. If P1 passes, swap in the official kernels for speed.

Used here to build a DENOISER: input = noisy image bits + a binary timestep code,
output = per-pixel probability that the clean bit x0 == 1.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


def logic_gates(a, b):
    """All 16 binary boolean functions, continuous-relaxed. a,b: (...,N) in [0,1].

    Returns (...,N,16). Each relaxation is the standard multilinear form so that
    plugging a,b in {0,1} recovers the exact truth table.
    """
    ab = a * b
    return torch.stack([
        torch.zeros_like(a),     # 0  FALSE
        ab,                      # 1  a AND b
        a - ab,                  # 2  a AND NOT b
        a,                       # 3  a
        b - ab,                  # 4  NOT a AND b
        b,                       # 5  b
        a + b - 2 * ab,          # 6  a XOR b
        a + b - ab,              # 7  a OR b
        1 - (a + b - ab),        # 8  NOR
        1 - (a + b - 2 * ab),    # 9  XNOR
        1 - b,                   # 10 NOT b
        1 - b + ab,              # 11 b IMPLIES a
        1 - a,                   # 12 NOT a
        1 - a + ab,              # 13 a IMPLIES b
        1 - ab,                  # 14 NAND
        torch.ones_like(a),      # 15 TRUE
    ], dim=-1)


class LogicLayer(nn.Module):
    """A layer of `out_dim` logic neurons, each wired to two fixed random inputs."""

    def __init__(self, in_dim, out_dim, tau=1.0, seed=0):
        super().__init__()
        self.in_dim, self.out_dim, self.tau = in_dim, out_dim, tau
        g = torch.Generator().manual_seed(1234 + seed)
        # Fixed random wiring (as in DLGN): each neuron reads two prior-layer units.
        self.register_buffer("ia", torch.randint(0, in_dim, (out_dim,), generator=g))
        self.register_buffer("ib", torch.randint(0, in_dim, (out_dim,), generator=g))
        # Learnable distribution over the 16 gates, per neuron.
        self.w = nn.Parameter(torch.randn(out_dim, 16) * 0.1)

    def forward(self, x, harden=False):
        a = x[:, self.ia]                       # (B, out_dim)
        b = x[:, self.ib]
        gates = logic_gates(a, b)               # (B, out_dim, 16)
        if harden:                              # discrete inference: pick one gate
            idx = self.w.argmax(dim=-1)         # (out_dim,)
            return gates.gather(-1, idx.view(1, -1, 1).expand(x.size(0), -1, 1)).squeeze(-1)
        p = F.softmax(self.w / self.tau, dim=-1)  # (out_dim, 16)
        return (gates * p).sum(dim=-1)          # (B, out_dim)


class GroupSumReadout(nn.Module):
    """Aggregate `in_dim` boolean units into `k_out` probabilities via grouped sum.

    Each output is sigmoid(scale * (count - group_size/2)): a soft popcount turned
    into a per-pixel probability. This is the only place a continuous value appears
    on the output side; the hidden compute is gates only.
    """

    def __init__(self, in_dim, k_out, scale=1.0):
        super().__init__()
        assert in_dim % k_out == 0, "in_dim must be divisible by k_out"
        self.k_out, self.group = k_out, in_dim // k_out
        self.scale = scale

    def forward(self, x):
        x = x.view(x.size(0), self.k_out, self.group).sum(dim=-1)  # (B, k_out)
        return torch.sigmoid(self.scale * (x - self.group / 2))


class LogicDenoiser(nn.Module):
    """x0-prediction denoiser: (noisy bits, timestep bits) -> P(x0 == 1) per pixel.

    The timestep code is *replicated* (t_rep copies) and *re-injected at every layer*,
    so the fixed random wiring reliably samples it. Without this, only ~1% of neurons
    ever see t and the network is blind to the noise level (flat-across-t accuracy).
    """

    def __init__(self, img_dim=784, t_bits=8, t_rep=32, group=8, depth=5, tau=1.0):
        super().__init__()
        width = img_dim * group                 # so the readout groups evenly to img_dim
        t_feat = t_bits * t_rep                  # replicated timestep features
        self.img_dim, self.t_bits, self.t_rep = img_dim, t_bits, t_rep
        # Every layer's input carries the replicated t features (re-injected each depth).
        in_dims = [img_dim + t_feat] + [width + t_feat] * (depth - 1)
        self.layers = nn.ModuleList(
            LogicLayer(in_dims[i], width, tau=tau, seed=i) for i in range(depth)
        )
        self.readout = GroupSumReadout(width, img_dim, scale=1.0)

    def forward(self, x_bits, t_bits_enc, harden=False):
        t_feats = t_bits_enc.repeat(1, self.t_rep)   # (B, t_bits * t_rep)
        h = torch.cat([x_bits, t_feats], dim=1)
        for i, layer in enumerate(self.layers):
            h = layer(h, harden=harden)
            if i < len(self.layers) - 1:             # re-inject t before the next layer
                h = torch.cat([h, t_feats], dim=1)
        return self.readout(h)                   # (B, img_dim) in (0,1)


def timestep_to_bits(t, n_bits):
    """t: (B,) long -> (B, n_bits) float {0,1}, LSB first. Gate-native conditioning."""
    ar = torch.arange(n_bits, device=t.device)
    return ((t.unsqueeze(-1) >> ar) & 1).float()
