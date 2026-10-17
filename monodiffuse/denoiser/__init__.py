"""1-bit denoiser — the core of the contribution.

A U-Net over the binary latent grid with binary weights AND binary activations. The input
latent is already ±1, so the network is genuinely 1-bit in. Deliberately-full-precision
parts (the only non-binary internals):
  - timestep embedding, injected via FiLM modulation;
  - the output logit head (predicts per-bit flip probabilities — the ">1 bit" exit);
  - first / last conv (standard BNN practice).

Everything else is XNOR + popcount. The open research question this package exists to
answer: can a denoiser with binary activations carry enough signal to reverse the
Bernoulli process at all, and where is the physical limit?
"""

# TODO(phase1): BitUNet denoiser (binary weight+activation blocks, FiLM time cond, logit head).
