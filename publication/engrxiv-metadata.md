# engrXiv submission metadata

## Manuscript type

Preprint / technical report

## Title

Training Binary-Weight Diffusion Models from Scratch: A Controlled MNIST and
CIFAR-10 Study

## Authors, in order

1. Ayushman Bhattacharya — Pollinations AI — ayushman.elixpo@gmail.com
2. Anwesha Chakraborty — Department of Computer Science and Engineering, JIS
   University — anwesha.elixpo@gmail.com
3. Nihal Gazi — Department of Computer Science and Engineering (AI and ML), IEM
   — nihalg2006@gmail.com

Add each author's ORCID in the submission form when available. Do not invent an
ORCID or use another person's identifier.

## Abstract

At one bit per weight, post-training quantization (PTQ) can destroy a diffusion
model's denoising function. Does this imply that a useful binary score network
must be distilled from a floating-point teacher? We isolate that question in a
small residual U-Net whose parameterization is identical across precision
conditions. We compare FP32 training, zero-shot PTQ, binary-weight training from
random initialization, floating-point warm-started quantization-aware training
(QAT), and a binary-weight/binary-activation core. We additionally cross
mean-centering with pre- versus post-activation residual ordering. All conditions
use the same data, optimizer, per-stage budget, and ancestral 1,000-step DDPM
sampler and are repeated over three training seeds; warm QAT additionally
inherits a 12-epoch FP32 checkpoint. Evaluation uses a held-out domain encoder
and reports Frechet and kernel distances, density, coverage, and class-prior
divergence, together with real-real and Gaussian-noise controls. On MNIST, the
best native W1A32 condition obtains domain-feature Frechet distance 46.33 ±
17.24, far below zero-shot PTQ (1314.20 ± 314.96), but well above FP32 (3.15 ±
0.38). On CIFAR-10, all conditions fail the control audit: even FP32 obtains
382.67 ± 46.91 versus a real-real baseline of 7.13. The previously proposed
centering explanation is not supported: centering increases latent-to-binary
angular error and worsens the pre-activation model. Thus, native optimization
substantially mitigates PTQ collapse on MNIST, but neither establishes parity
with floating point nor generalization to natural images. We release code,
per-seed checkpoints, hashes, histories, controls, and physically bit-packed
inference weights. Our conclusion is deliberately bounded: training path matters
at one bit, while a general teacher-free solution to binary diffusion remains
open.

## Keywords

- binary neural networks
- diffusion models
- quantization-aware training
- post-training quantization
- model compression
- reproducible machine learning
- edge AI

## Suggested categories

Use the closest available categories to computer engineering, machine learning,
artificial intelligence, and embedded systems. Choose only categories that the
submission interface actually provides.

## License

CC BY 4.0 for the manuscript if all three authors agree to that license. Confirm
this with the coauthors before submission. The associated source code remains
under the repository's MIT License.

## Related resources

- Code: https://github.com/elixpo/monodiffuse
- Technical report number: MonoDiffuse-TR-2026-01
- arXiv status: do not describe the manuscript as arXiv-published or accepted

## Disclosure

This is a preprint and has not undergone peer review. The CIFAR-10 experiment is
reported as a failed small-model stress test, not as evidence of competitive
natural-image generation.
