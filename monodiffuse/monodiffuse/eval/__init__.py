"""Evaluation metrics, shared across phases.

  - FID / Frechet distance (realism)
  - Legibility: classifier-confidence utility score on generated samples
  - Memorization: avg distance to nearest training neighbor (higher = less copying)
  - Diversity: avg intra-sample distance (mode-collapse check)

The Phase 0 implementations live in experiments/v0_mnist/{rigorous_bench_trainer,
legibility_evaluation}.py (MNIST judge). Phase 1 reuses them with a CIFAR-10 classifier.
"""

# TODO(phase1): port the Phase 0 metric code here; swap the MNIST judge for a CIFAR-10 one.
