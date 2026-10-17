#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BUILD_DIR="$SCRIPT_DIR/build"
FIGURE_DIR="$SCRIPT_DIR/../figures"

python3 "$SCRIPT_DIR/generate_schematics.py"
mkdir -p "$BUILD_DIR" "$FIGURE_DIR"

for name in lcd_interface experimental_platform; do
  kicad-cli sch export pdf \
    --black-and-white \
    --exclude-drawing-sheet \
    --output "$BUILD_DIR/$name-full.pdf" \
    "$SCRIPT_DIR/$name.kicad_sch"
  pdfcrop --margins "6 6 6 6" \
    "$BUILD_DIR/$name-full.pdf" \
    "$FIGURE_DIR/$name.pdf"
  kicad-cli sch export svg \
    --black-and-white \
    --exclude-drawing-sheet \
    --output "$BUILD_DIR" \
    "$SCRIPT_DIR/$name.kicad_sch"
done

echo "KiCad sources refreshed."
echo "Cropped paper figures: $FIGURE_DIR/lcd_interface.pdf"
echo "                       $FIGURE_DIR/experimental_platform.pdf"
