"""MonoDiffuse — pushing a 1-bit network to its physical limit as a diffusion generator.

Phase 1 stack (fully binary, multiply-free):

    RGB ──[binary VAE encoder]──▶ binary latent z ∈ {0,1}^(H·W·B)
                                      │  Bernoulli bit-flip diffusion
                          z_0 ◀───────┤  (1-bit weights + 1-bit activations)
    RGB ◀─[binary VAE decoder]── z_0

Subpackages
-----------
layers      : binary primitives (BitLinear, BitConv2d, straight-through activation binarization)
vae         : binary-latent autoencoder (the "1-bit VAE"); fast deterministic decode at inference
diffusion   : Bernoulli bit-flip forward process + closed-form reverse posterior
denoiser    : 1-bit weight + 1-bit activation U-Net that predicts per-bit flip logits
eval        : FID / legibility / memorization metrics (shared with the Phase 0 baseline)
"""

__version__ = "0.1.0.dev0"
