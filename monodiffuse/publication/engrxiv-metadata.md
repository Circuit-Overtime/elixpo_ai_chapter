# engrXiv submission metadata

## Manuscript type

Preprint / technical report

## Title

Native Binary-Weight Training Outperforms Zero-Shot Sign Projection in MNIST
Diffusion

## Authors, in order

1. Ayushman Bhattacharya — Pollinations AI — ayushman.elixpo@gmail.com
2. Anwesha Chakraborty — Department of Computer Science and Engineering, JIS
   University — anwesha.elixpo@gmail.com
3. Nihal Gazi — Department of Computer Science and Engineering (AI and ML), IEM
   — nihalg2006@gmail.com

Add each author's ORCID in the submission form when available. Do not invent an
ORCID or use another person's identifier.

## Abstract

Does severe failure after projecting a diffusion model to one-bit weights show
that its binary representation is unusable? We test that implication, rather
than propose a new quantizer, in a small MNIST residual U-Net. We compare
floating-point training, zero-shot per-channel sign/scale projection of a
trained model, binary-weight training from random initialization, floating-point
warm-started quantization-aware training (QAT), and a binary-weight/
binary-activation core. The primary FP32, native W1A32, and projected W1A32
comparison fixes the parameterization, data, training budget where applicable,
and 1,000-step ancestral sampler, with three independent training seeds. Native
W1A32 training obtains domain-feature Frechet distance 46.33 ± 17.24, 28.4-fold
lower than matched zero-shot projection (1314.20 ± 314.96), but remains
substantially worse than FP32 (3.15 ± 0.38). Warm QAT also recovers much of the
projection loss, while the W1A1 core retains a large distributional gap. An
elementary feasible-set argument explains why one projected floating-point
solution is not an impossibility certificate for the binary hypothesis class.
The supported claim is deliberately local: on MNIST, optimizing binary forwards
reaches a much better W1A32 solution than this zero-shot projection baseline;
this does not establish full W1A1 success, floating-point parity, or transfer to
natural images.

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

Before submission, every named author should review the final PDF, code,
figures, and metadata and agree to be accountable for them. Review engrXiv's
current AI policy at https://engrxiv.org/ai-policy and include any disclosure it
requires. Do not claim that no AI-assisted tooling was used if such tooling
contributed to manuscript preparation.
