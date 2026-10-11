# MonoDiffuse

MonoDiffuse is a controlled study of one-bit-weight diffusion training. The main
question is narrow: when zero-shot one-bit post-training quantization fails, how
much can be recovered by optimizing with binary weights in the forward pass?

The current study compares parameter-compatible variants of one small residual
U-Net:

- FP32 training;
- native W1A32 training from random initialization;
- zero-shot W1A32 post-training quantization (PTQ);
- FP32-initialized W1A32 quantization-aware training (QAT); and
- a W1A1 core whose boundary, normalization, time-conditioning, scaling, and
  residual operations remain floating point.

Optimization stages use the same optimizer, 12-epoch budget, diffusion schedule,
and ancestral 1,000-step sampler. Native and FP32 models receive one stage; PTQ
adds no optimization after FP32; warm QAT receives an additional 12-epoch binary
stage after FP32 pretraining. Results are repeated over training seeds 0, 1, and 2.

## Scientific contribution

The central finding is that one-bit diffusion failure is not caused solely by the
binary representation: a substantial part is caused by projecting a solution
optimized in floating point into binary weights after training. By holding the
network parameterization fixed and changing the training path, the study
separates representational limitations from post-training projection failure.

The controlled experiments show that:

- native W1A32 optimization substantially mitigates zero-shot PTQ collapse on
  MNIST, although it remains clearly behind matched FP32 training;
- mean-centering does not reduce trained latent-to-binary angular distortion and
  worsens the strongest pre-activation condition, rejecting the proposed
  centering explanation;
- the benefit of pre-activation residual ordering is conditional rather than a
  universal stability principle;
- peak classifier confidence is invalid as a generative-quality metric in this
  setting because Gaussian noise receives near-perfect confidence; and
- the small-model CIFAR-10 experiment cannot establish natural-image binary
  performance because even its FP32 control fails by a large margin.

The scientific claim is deliberately bounded: **optimization path explains a
substantial portion of one-bit PTQ failure in this controlled MNIST setting, but
the study does not establish FP32 parity or a general teacher-free solution to
binary diffusion.** Physical bit packing, three-seed artifacts, controls, hashes,
and exact commands support this claim as reproducibility contributions rather
than being presented as a new binary-training algorithm.

## Current finding

On MNIST, the best native W1A32 condition substantially outperforms zero-shot PTQ,
but it does **not** match the FP32 baseline. Domain-feature Fréchet distance is
`46.33 ± 17.24` for native uncentered/pre-activation W1A32, versus
`1314.20 ± 314.96` for matched PTQ and `3.15 ± 0.38` for FP32.

The experiments also reject two claims from an earlier draft:

- mean-centering does not reduce trained latent-to-binary angular error and hurts
  the strongest pre-activation condition; and
- peak classifier confidence is not a valid quality score here, because clamped
  Gaussian noise receives mean confidence `1.000`.

The full metric suite therefore reports domain-feature Fréchet and kernel
distances, density, coverage, and class-prior Jensen--Shannon divergence, with
real--real and Gaussian-noise controls. On CIFAR-10, W1A1-core has the best mean
domain-feature Fréchet distance among the tested models (`365.02 ± 26.97`), but
the FP32 baseline is also poor (`382.67 ± 46.91`) relative to the real--real
control (`7.13`). Its apparent ranking is therefore not evidence of binary
natural-image success. CIFAR-10 is reported as an inconclusive, failed-model
stress test rather than a competitive benchmark.

## Reproduce the study

Install the pinned environment:

```bash
python -m venv venv
venv/bin/pip install -r requirements.txt
```

Run the tests:

```bash
venv/bin/python -m pytest -q
```

Train all MNIST conditions with three independent seeds:

```bash
venv/bin/python -m experiments.v1_binary_study.train suite \
  --dataset mnist --seeds 0,1,2 --epochs 12 \
  --batch-size 256 --base-channels 16
```

Evaluate with the exact ancestral sampler:

```bash
venv/bin/python -m experiments.v1_binary_study.evaluate suite \
  --dataset mnist --encoder-epochs 10 --eval-samples 2000 \
  --eval-batch-size 256 --sampler ddpm
```

Completed evaluations can be resumed safely with `--resume`. The committed
aggregate tables are in `artifacts/v1_binary_study/{mnist,cifar10}/summary.json`.

Export physically packed binary inference weights:

```bash
venv/bin/python -m experiments.v1_binary_study.export \
  artifacts/v1_binary_study/mnist/native_uncentered_pre/seed_0/checkpoint.pt
```

The representative packed tensor payload is 121,316 bytes, versus 875,972 bytes
for the FP32 state (7.22×). This is a storage measurement. The project does not yet
implement packed XNOR convolution kernels and makes no measured latency or energy
claim.

## Diffuino hardware artifact

Diffuino runs live class-conditioned MNIST denoising on the Arduino UNO Q's
Qualcomm processor and streams frames to the STM32-driven 8×13 LED matrix. This
is a separate system demonstration: its reliable interactive default is FP32 and
is not evidence for the controlled binary-model results. The paper-linked W1A32
model is also exportable to ONNX, but its binary-trained weights execute as
ordinary floating-point convolution tensors rather than packed XNOR operations.

Build the installable Arduino App archive with:

~~~bash
python -m apps.diffuino.package_app
~~~

The resulting dist/diffuino.zip can be copied to an UNO Q and installed with
arduino-app-cli app import ~/diffuino.zip. Full flash, CLI, status-LED, and model
details are in [apps/diffuino/README.md](apps/diffuino/README.md).
The reproducible BCD-selector circuit, KiCad source, zero-warning ERC report,
bill of materials, and exhaustive truth table are in
[hardware/diffuino_selector](hardware/diffuino_selector/README.md).

## Repository map

- `experiments/v1_binary_study/`: matched models, training, evaluation, export,
  tests, and exact commands;
- `artifacts/v1_binary_study/`: per-seed checkpoints, hashes, histories, metrics,
  controls, summaries, and sample grids;
- `paper/v0_mnist/paper.tex`: the paper source; and
- `hardware/diffuino_selector/`: KiCad source and publication exports for the
  BCD input, validity gate, generate trigger, and reset circuit; and
- `experiments/v0_mnist/`: archived exploratory scripts and figures, not the
  source of the controlled-study results.

## License

[MIT](LICENSE)
