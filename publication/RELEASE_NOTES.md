# MonoDiffuse v1.0.0

This is the archival reproducibility release associated with
**MonoDiffuse-TR-2026-01**, *Training Binary-Weight Diffusion Models from Scratch:
A Controlled MNIST and CIFAR-10 Study*.

Included:

- matched FP32, native W1A32, PTQ W1A32, warm-QAT, and W1A1-core experiments;
- three-seed MNIST and CIFAR-10 checkpoints and evaluation artifacts;
- real-real and Gaussian-noise evaluation controls;
- physical one-bit weight packing and storage accounting;
- the paper source and compiled preprint; and
- the Diffuino Arduino UNO Q application, firmware, models, and KiCad design.

Scientific scope:

- native binary-forward optimization mitigates zero-shot one-bit PTQ collapse on
  MNIST but remains behind the matched FP32 model;
- the centering hypothesis is not supported by the controlled ablation; and
- CIFAR-10 is a failed compact-model stress test because the FP32 control also
  fails, not evidence of competitive natural-image generation.

This release does not claim packed binary execution, measured acceleration,
energy savings, FP32 parity, or a general teacher-free binary-diffusion method.

After engrXiv assigns the paper DOI, add it to this release description and to
the repository's `CITATION.cff` before publishing the GitHub release.
