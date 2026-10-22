#!/usr/bin/env bash
# Measure one RV565 standalone configuration end to end: encode a clip
# window, build and flash the benchmark in serial or overlap mode, collect
# repeated runs, and aggregate them.
#
# Usage: tools/run_rv565_matrix.sh <source-video> <start-seconds> <serial|overlap> [port] [runs]
# Requires ESP-IDF v5.5.1 exported in the shell and a clean tracked tree.
set -euo pipefail

source_video=$1
start=$2
mode=$3
port=${4:-/dev/ttyACM0}
runs=${5:-10}

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo"

command -v idf.py >/dev/null ||
  { echo "Export ESP-IDF first: . ~/esp/esp-idf-v5.5.1/export.sh" >&2; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] ||
  { echo "Commit or stash tracked changes so runs record a clean revision." >&2; exit 1; }
case $mode in
  serial) overlap=0 ;;
  overlap) overlap=1 ;;
  *) echo "mode must be serial or overlap" >&2; exit 1 ;;
esac

label=$(printf 'bbb%03d-%s' "$start" "$mode")

python3 tools/encode_video_benchmark.py "$source_video" \
  experiments/video_dma/main/video.rv565 --start "$start" --seconds 10 --fps 24
(
  cd experiments/video_dma
  idf.py -DRV565_OVERLAP="$overlap" -DRV565_BACKLIGHT="${RV565_BACKLIGHT:-60}" -DRV565_SELFTEST=0 build
  idf.py -p "$port" flash
)

for run in $(seq -w 1 "$runs"); do
  .venv/bin/python tools/collect_video_benchmark.py --port "$port" \
    --label "$label-r$run"
done
python3 tools/summarize_video_benchmarks.py \
  paper/measurements/video-benchmark-"$label"-r*.json --label "$label"
