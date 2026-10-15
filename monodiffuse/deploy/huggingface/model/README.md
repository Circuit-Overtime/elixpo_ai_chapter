---
license: mit
library_name: onnxruntime
pipeline_tag: unconditional-image-generation
tags:
  - diffusion
  - mnist
  - binary-neural-network
  - onnx
  - quantization
---

# MonoDiffuse MNIST checkpoints

Compact class-conditioned MNIST diffusion checkpoints from the
[MonoDiffuse](https://github.com/elixpo/monodiffuse) project.

## Files

- `mnist_conditional_fp32.onnx`: reliable FP32 conditional generator used by
  the Diffuino appliance.
- `mnist_conditional_w1a32.onnx`: native binary-forward W1A32 research
  checkpoint. Convolutional weights are binarized during the forward graph;
  activations and boundary/normalization operations remain floating point.
- Matching `.pt` files: PyTorch checkpoints.
- Matching `.json` files: training history, configuration, provenance, and
  checkpoint SHA-256 values.
- `mnist_classifier.onnx`: held-out MNIST evaluator used only to name generated
  samples in the demo.

Both generators are small residual U-Nets trained for 20 epochs on MNIST with a
1,000-step linear diffusion schedule. They accept `image`, `timestep`, and
`label` inputs. Images use shape `(1, 1, 28, 28)` and range `[-1, 1]`; labels
are integers from 0 through 9.

## Important scope

The W1A32 model is an experimental binary-forward checkpoint, not a packed
binary execution engine. ONNX Runtime still executes ordinary floating-point
operators around the exported sign/scale graph, so these files make no latency
or energy-efficiency claim. The associated paper's scientific result is
deliberately limited to controlled MNIST experiments.

Source, training code, evaluation artifacts, and the Arduino UNO Q deployment
are available in the repository. The exact controlled-study artifact commit is
[`604a34d`](https://github.com/elixpo/monodiffuse/tree/604a34d).

## Authors

Ayushman Bhattacharya, Anwesha Chakraborty, and Nihal Gazi.

