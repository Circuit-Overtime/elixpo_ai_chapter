"""Binary-latent VAE — the "1-bit VAE".

Encodes a 32x32x3 image to a binary code z in {0,1}^(H*W*B) via a sigmoid + Bernoulli
straight-through bottleneck, and decodes it back to RGB. The encoder/decoder endpoints
are full precision (the deliberate ">1 bit" entry/exit); only the latent is binary.

Design constraints:
  - bit budget B is the key knob (start ~8x8x32 = 2048 bits on CIFAR-10);
  - a bit-balance regularizer pushes each bit's marginal toward 0.5 to avoid degenerate codes;
  - decoder capacity is capped on purpose so the diffusion prior does the generative work,
    not a high-capacity decoder (see the Phase 0 "texture tax" finding).

At inference the decode is a single deterministic forward pass -> fast sampling.
"""

# TODO(phase1): BinaryVAE (encoder, Bernoulli bottleneck, decoder) + bit-balance loss.
