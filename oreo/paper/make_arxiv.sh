#!/usr/bin/env bash
# Build the paper and package the exact source set arXiv needs:
# rv565.tex, the generated rv565.bbl (arXiv does not run BibTeX), and the
# two schematic figures. The tarball is written next to this script.
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STAGE="$SCRIPT_DIR/arxiv"
cd "$SCRIPT_DIR"

if grep -q 'zenodo.XXXXXXX' rv565.tex; then
  echo "Set \\artifactdoi in rv565.tex to the Zenodo DOI first." >&2
  exit 1
fi

latexmk -pdf -interaction=nonstopmode rv565.tex >/dev/null
if grep -qE 'Overfull|undefined|Citation .* undefined' rv565.log; then
  grep -nE 'Overfull|undefined' rv565.log >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE/figures"
cp rv565.tex rv565.bbl "$STAGE/"
cp figures/lcd_interface.pdf figures/experimental_platform.pdf "$STAGE/figures/"

# Compile the staged copy without BibTeX, exactly as arXiv will.
(cd "$STAGE" && pdflatex -interaction=nonstopmode rv565.tex >/dev/null &&
  pdflatex -interaction=nonstopmode rv565.tex >/dev/null)
# Package only the sources arXiv needs, never build byproducts.
FILES="rv565.tex rv565.bbl figures/lcd_interface.pdf figures/experimental_platform.pdf"
tar -C "$STAGE" -czf rv565-arxiv.tar.gz $FILES
rm -f rv565-arxiv.zip
# Add the figures directory whole: the zipfile CLI strips paths from files.
(cd "$STAGE" && python3 -I -m zipfile -c "$SCRIPT_DIR/rv565-arxiv.zip" \
  rv565.tex rv565.bbl figures)
echo "arXiv upload: $SCRIPT_DIR/rv565-arxiv.zip (or rv565-arxiv.tar.gz)"
