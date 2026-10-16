# Zenodo preprint metadata

## Digital Object Identifier

Answer **No** to "Do you already have a DOI for this upload?", then select
**Get a DOI now**. Keep the record as a draft until the reserved DOI has been
added to the manuscript and repository metadata.

## Resource type

Publication → Preprint

## Title

Native Binary-Weight Training Outperforms Zero-Shot Sign Projection in MNIST
Diffusion

## Publication date

2026-10-17

## Creators, in order

1. Bhattacharya, Ayushman — Pollinations AI
2. Chakraborty, Anwesha — Department of Computer Science and Engineering, JIS
   University
3. Gazi, Nihal — Department of Computer Science and Engineering (AI and ML), IEM

Add only verified ORCIDs. Do not invent or infer an ORCID.

## Description

Does severe failure after projecting a diffusion model to one-bit weights show
that its binary representation is unusable? We test that implication, rather
than propose a new quantizer, in a small MNIST residual U-Net. We compare
floating-point training, zero-shot per-channel sign/scale projection of a
trained model, binary-weight training from random initialization, floating-point
warm-started quantization-aware training (QAT), and a binary-weight/
binary-activation core. The primary FP32, native W1A32, and projected W1A32
comparison fixes the parameterization, data, training budget where applicable,
and 1,000-step ancestral sampler, with three independent training seeds. Native
W1A32 training obtains domain-feature Fréchet distance 46.33 ± 17.24, 28.4-fold
lower than matched zero-shot projection (1314.20 ± 314.96), but remains
substantially worse than FP32 (3.15 ± 0.38). Warm QAT also recovers much of the
projection loss, while the W1A1 core retains a large distributional gap. An
elementary feasible-set argument explains why one projected floating-point
solution is not an impossibility certificate for the binary hypothesis class.
The supported claim is deliberately local: on MNIST, optimizing binary forwards
reaches a much better W1A32 solution than this zero-shot projection baseline;
this does not establish full W1A1 success, floating-point parity, or transfer to
natural images.

This record is an unreviewed technical report. The accompanying source archive
contains the LaTeX manuscript, bibliography, and manuscript figures. Code,
checkpoints, evaluation artifacts, and the Diffuino demonstration are available
from the related project resources.

## Version

1.0

## Language

English

## License

Creative Commons Attribution 4.0 International (CC BY 4.0)

## Keywords

- binary neural networks
- diffusion models
- binary-weight training
- one-bit quantization
- post-training quantization
- quantization-aware training
- MNIST
- reproducible machine learning

## Related works

- `Is supplemented by`: https://github.com/elixpo/monodiffuse
- `Is supplemented by`: https://huggingface.co/Elixpo/monodiffuse
- `Is supplemented by`: https://huggingface.co/spaces/Elixpo/diffuino
- `Is identical to`: https://research.elixpo.com/monodiffuse/monodiffuse-preprint.pdf
  (add this only after the URL resolves publicly)

Add the Zenodo software DOI later as `Is supplemented by` after the software
release has been archived. Do not describe the manuscript as peer reviewed or
accepted by a journal, arXiv, engrXiv, or Preprints.org.

## Notes

Technical report number: MonoDiffuse-TR-2026-01.

Generative AI systems were used during software development and to assist with
drafting, organization, and language editing. The authors retain responsibility
for the experimental design, execution, verification of the reported results
and references, and the final manuscript.
