# Reproducible binary-diffusion study

This package replaces the duplicated Phase-0 scripts with one controlled pipeline.
Every condition uses an identical parameterization; only the configured forward
quantization and residual-block ordering change.

Terminology is deliberately precise:

- `fp`: FP32 parameters and evaluation; optional AMP during training.
- `native_*`: random initialization with binary convolution weights in every forward pass.
- `ptq_*`: zero-shot post-training sign projection of the matching FP checkpoint.
- `warm_qat_centered`: centered binary forwards initialized from the FP checkpoint, then trained.
- `native_w1a1_core`: binary convolution weights and block activations. Boundary layers,
  normalization, time conditioning, scales, and residual accumulation remain floating point.

Run the unit tests:

```bash
python -m pytest -q experiments/v1_binary_study/tests
```

Run the full MNIST training suite with three independent seeds:

```bash
python -m experiments.v1_binary_study.train suite \
  --dataset mnist --seeds 0,1,2 --epochs 20
```

Artifacts are stored under `artifacts/v1_binary_study/<dataset>/<variant>/seed_N`.
Each checkpoint is accompanied by its complete configuration, environment provenance,
training history, SHA-256 digest, model-size accounting, and quantization diagnostics.

Train the held-out domain encoder and evaluate all checkpoints:

```bash
python -m experiments.v1_binary_study.evaluate suite \
  --dataset mnist --encoder-epochs 10 --eval-samples 2000 --sampler ddpm
```

Evaluation reports feature-space FID and KID, density, coverage, and class-prior
Jensen--Shannon divergence. It also records real-vs-real and clamped Gaussian-noise
controls. Classifier confidence is retained only as a diagnosed auxiliary value, not
as a quality metric.

Binary checkpoints retain latent FP32 weights for training. To produce a genuine
inference-storage artifact with one packed sign bit per quantized weight and one FP32
scale per output channel, run:

```bash
python -m experiments.v1_binary_study.export \
  artifacts/v1_binary_study/mnist/native_centered_pre/seed_0/checkpoint.pt
```

The adjacent JSON manifest records both payload and container sizes and identifies
every packed and floating-point tensor. This is a storage export, not a claim that
standard PyTorch convolutions execute packed XNOR kernels.

For CIFAR-10, the loader accepts either torchvision's original extracted archive or
the `uoft-cs/cifar10` Parquet mirror as `data/cifar10-{train,test}.parquet`. Both
contain the canonical 50,000/10,000-image splits; the mirror avoids relying on the
rate-limited upstream archive host.
