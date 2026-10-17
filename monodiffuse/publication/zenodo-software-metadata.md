# Zenodo software-release metadata

## Resource type

Software

## Title

MonoDiffuse: controlled one-bit-weight diffusion experiments and Diffuino
artifact

## Version

1.0.0

## Publication date

2026-10-14 (or the actual GitHub release date if later)

## Creators, in order

1. Bhattacharya, Ayushman — Pollinations AI
2. Chakraborty, Anwesha — Department of Computer Science and Engineering, JIS
   University
3. Gazi, Nihal — Department of Computer Science and Engineering (AI and ML), IEM

Add verified ORCIDs when available.

## Description

MonoDiffuse is the reproducibility release for a controlled study of one-bit
weight diffusion training. It contains matched FP32, native W1A32, post-training
quantized W1A32, warm-started quantization-aware, and W1A1-core conditions;
three-seed MNIST and CIFAR-10 artifacts; evaluation controls; physical weight
packing; and the Diffuino Arduino UNO Q demonstration. The supported scientific
claim is deliberately narrow: native binary-forward optimization substantially
mitigates zero-shot one-bit PTQ collapse on MNIST but does not attain FP32 parity,
and the compact CIFAR-10 setup fails even for its FP32 control.

## License

MIT

## Keywords

binary neural networks; diffusion models; quantization-aware training;
post-training quantization; reproducible machine learning; edge AI; Arduino UNO Q

## Related identifiers

- `Is supplement to`: https://doi.org/10.5281/zenodo.23424654
- `Is identical to`: https://github.com/elixpo/monodiffuse/tree/v1.0.0

The paper DOI above identifies the deposited preprint version. Keep the software
as a separate Zenodo record and use this relationship to connect the two.
