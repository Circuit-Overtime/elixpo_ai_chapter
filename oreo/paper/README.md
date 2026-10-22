# RV565 paper source

This directory contains the RV565 paper by Ayushman Bhattacharya (Pollinations
AI) and Anwesha Chakraborty (Department of Computer Science and Engineering,
JIS University). Contact: `ayushman.elixpo@gmail.com`. Target: arXiv cs.AR,
cross-listed to cs.PF and cs.MM.

Every number in the paper comes from a committed measurement or from a script
run over one. Do not add estimates. Projections are labelled as projections in
the text.

| Source | Produces |
| --- | --- |
| `measurements/video-benchmark-bbb{090,360}-{serial,overlap}-aggregate-*.json` | Table 4 standalone rows, Table 6, Section 6.2 |
| `measurements/video-benchmark-oreoos-gallery-20261021T184820Z.json` | Table 4 integrated row |
| `../tools/analyze_rv565_paper.py` | Sections 6.3–6.6, Tables 5 and 6, Figure 4 |
| `figures/*.pdf` (from `schematics/build.sh`) | Figure 3 |

Measurements whose names do not start with `bbb` come from an earlier,
non-redistributable clip and are not used by the paper.

## Workloads

Both windows come from *Big Buck Bunny* (CC BY 3.0, © copyright 2008, Blender
Foundation / www.bigbuckbunny.org), file `big_buck_bunny_480p_h264.mov` from
<https://download.blender.org/peach/bigbuckbunny_movies/>, SHA-256
`b2acb9bddcb384f9762f919af8f6d8b4be781e40ad2f35a37cc12beef55b9a27`. They were
encoded with FFmpeg 8.0.1 and zlib 1.3.1:

```bash
python3 tools/encode_video_benchmark.py big_buck_bunny_480p_h264.mov w90.rv565 --start 90 --seconds 10 --fps 24
python3 tools/encode_video_benchmark.py big_buck_bunny_480p_h264.mov w360.rv565 --start 360 --seconds 10 --fps 24
```

| Window | Container SHA-256 |
| --- | --- |
| W90 | `d62fc8a669eebcff68dfd2bcc9df0670fcfaa9ab2a4dec297173e0c694dce8e8` |
| W360 | `cb16d3dffe1b9b63f24b47c1870c99f1fb2a58eb266b8dc99034e81164fbe6c0` |

The analysis script refuses any container whose digest differs from the one
recorded with the runs. Run it from the repository root:

```bash
python3 -I tools/analyze_rv565_paper.py w90.rv565 --label bbb090-serial
python3 -I tools/analyze_rv565_paper.py w90.rv565 --label bbb090-overlap
python3 -I tools/analyze_rv565_paper.py w360.rv565 --label bbb360-serial \
  --transfer-from bbb090-serial --transfer-media w90.rv565
python3 -I tools/analyze_rv565_paper.py w360.rv565 --label bbb360-overlap
python3 -I tools/analyze_rv565_paper.py w90.rv565 --label bbb090-serial \
  --transfer-from bbb360-serial --transfer-media w360.rv565
```

`tools/run_rv565_matrix.sh` reproduces one standalone configuration end to
end on the badge.

## Evaluated revisions

The collectors hash the sources used for each run. The matching commits are:

| Path | Commit | Evidence |
| --- | --- | --- |
| Standalone firmware and build defaults | `c3e7619` | Run JSONs record `8739e61`, the same tree (`790874e`) before a message-only history rewrite; the tracked diff digest is that of an empty diff |
| `apps/gallery/src/app.py` | `dcca17b` | `gallery` digest in the Gallery JSON |
| `oreoOS/launcher.py` | `aa9d719` | `launcher` digest |
| `firmware/usermods/oreo_rv565/modoreo_rv565.c` | `de149c4` | `firmware_module` digest |

## Build

```bash
cd paper
latexmk -pdf rv565.tex
```

## Submit

1. Reserve a Zenodo DOI, set `\artifactdoi` in `rv565.tex` and `doi` in
   `../CITATION.cff`, and publish the archive with both `.rv565` containers.
2. Run `./make_arxiv.sh`. It refuses to package while the DOI is a
   placeholder or the build has warnings, then verifies that the staged
   sources compile without BibTeX.
3. Upload `rv565-arxiv.tar.gz` to arXiv: primary cs.AR, cross-lists cs.PF and
   cs.MM, licence CC BY 4.0.
