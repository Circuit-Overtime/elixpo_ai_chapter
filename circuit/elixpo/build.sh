#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$HERE/build"

python3 "$HERE/generate_badge_schematic.py"
mkdir -p "$BUILD_DIR"

kicad-cli sch erc "$HERE/elixpo.kicad_sch" \
  --severity-all \
  --output "$BUILD_DIR/erc.rpt"

kicad-cli sch export pdf "$HERE/elixpo.kicad_sch" \
  --output "$BUILD_DIR/oreo-badge-schematic.pdf"

kicad-cli sch export bom "$HERE/elixpo.kicad_sch" \
  --fields 'Reference,Value,Footprint,QUANTITY,DNP' \
  --labels 'Refs,Value,Footprint,Qty,DNP' \
  --output "$BUILD_DIR/kicad-bom.csv"

printf 'Built schematic, ERC report and BOM in %s\n' "$BUILD_DIR"
