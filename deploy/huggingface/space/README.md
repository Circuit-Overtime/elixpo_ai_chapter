---
title: Diffuino Live
emoji: 🔢
colorFrom: indigo
colorTo: purple
sdk: gradio
app_file: app.py
pinned: false
license: mit
models:
  - Elixpo/monodiffuse
tags:
  - diffusion
  - mnist
  - onnx
  - binary-neural-network
---

# Diffuino Live

Watch a compact conditional MNIST diffusion model turn noise into a requested
digit. Choose the reliable FP32 deployment model or the experimental native
W1A32 binary-forward checkpoint, then stream the denoising trajectory in the
browser.

The full source, Arduino UNO Q application, hardware selector, checkpoints,
and experimental artifacts live in
[MonoDiffuse](https://github.com/elixpo/monodiffuse).
