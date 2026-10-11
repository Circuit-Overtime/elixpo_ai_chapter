# RV565 paper source

This directory contains the measurement-ready academic draft for the RV565
video architecture by Ayushman Bhattacharya (Pollinations AI), Anwesha
Chakraborty (Department of Computer Science and Engineering, JIS University),
and Nihal Gazi (Department of Computer Science and Engineering (AI & ML), IEM).
Contact: `ayushman.elixpo@gmail.com`.

The quantitative fields are intentionally blank. Do not replace them with
estimates. Populate them only from committed benchmark scripts and raw logs
captured on the ESP32-S3 badge.

The prose follows the actual engineering sequence: Python playback exposed
interpreter starvation, native scaling exposed flash I/O, RV565 v4 validated
PSRAM preloading, and the RV565 v6 standalone benchmark demonstrated the DMA
path before reintegration with OreoOS. Figure requirements and provenance are
documented in [`figures/README.md`](figures/README.md).

Engineering work that gates the evaluation is tracked in:

- [#48 — persistent RMT RX failure](https://github.com/elixpo/oreo/issues/48)
- [#49 — component-level firmware/filesystem flashing](https://github.com/elixpo/oreo/issues/49)
- [#50 — native RV565 v6 decompression](https://github.com/elixpo/oreo/issues/50)

Build locally with:

```bash
cd paper
latexmk -pdf rv565.tex
```

The minimum manual sequence is:

```bash
pdflatex rv565.tex
bibtex rv565
pdflatex rv565.tex
pdflatex rv565.tex
```

Before submission:

1. pin every firmware, ESP-IDF, MicroPython, and ESP-GMF commit;
2. publish the media manifest, licences, and SHA-256 hashes;
3. commit raw serial logs and the script that produces each table;
4. replace every blank rule in the evaluation section;
5. revise the abstract and conclusion with measured results;
6. select a venue template and apply its anonymisation policy; and
7. archive the evaluated repository revision and add its DOI to both the
   paper and `CITATION.cff`.
