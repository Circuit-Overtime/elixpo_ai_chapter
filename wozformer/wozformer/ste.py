"""Straight-Through Estimator for binary (bipolar) gradient flow.

The STE is what makes our HDC-RWKV trainable end-to-end. Forward pass uses
sign() to enforce {-1, +1}; backward pass pretends the operation was identity
(or, in the clamped variant, the identity restricted to [-1, +1]).

Reference: Bengio et al. 2013 ("Estimating or Propagating Gradients Through
Stochastic Neurons"); Courbariaux et al. 2016 (BNN).
"""
from __future__ import annotations

import torch


def ste_sign(x: torch.Tensor) -> torch.Tensor:
    """Sign with straight-through gradient (clamped to [-1, +1] in backward).

    Forward:  sign(x)        ∈ {-1, +1}
    Backward: passes gradient through x.clamp(-1, 1) — i.e. zero outside the
              active range, identity inside. Standard "clipped STE" from BNN.
    """
    # Trick: `sign(x).detach() + clamp(x) - clamp(x).detach()` evaluates to
    # sign(x) in forward and passes ∂/∂(clamp(x)) backward.
    return x.sign().detach() + x.clamp(-1, 1) - x.clamp(-1, 1).detach()
