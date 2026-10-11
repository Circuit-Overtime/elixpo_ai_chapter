"""Binary primitives for the MonoDiffuse stack.

Everything between the VAE endpoints and the denoiser output head is intended to be
multiply-free: weights in {-1, +1} and activations binarized with a straight-through
estimator (STE), so the forward pass reduces to XNOR + popcount.

Planned API (not yet implemented):

    binarize_ste(x)          -> sign(x) on the forward pass, identity gradient on backward
    class BitLinear(nn.Linear)   : binary-weight linear, optional binary input
    class BitConv2d(nn.Conv2d)   : binary-weight conv, optional binary activation
    class BinaryActivation        : learnable-threshold activation binarizer

The Phase 0 baseline already ships a weight-only `BitConv2d` inside
experiments/v0_mnist/*.py; Phase 1 generalizes it to binarize activations too.
"""

# TODO(phase1): implement binarize_ste, BitLinear, BitConv2d, BinaryActivation.
