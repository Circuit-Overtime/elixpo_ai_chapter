#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

iterations="${QF_ITERATIONS:-20}"
warmup="${QF_WARMUP:-5}"
payload_size="${QF_PAYLOAD_SIZE:-8}"
run_label="${1:-$(date --utc +%Y%m%dT%H%M%SZ)}"

if [[ ! "$run_label" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "run label may contain only letters, numbers, dots, underscores, and hyphens" >&2
  exit 1
fi

if ! command -v qf-stage1 >/dev/null 2>&1; then
  echo "qf-stage1 is unavailable; activate .venv and run: python -m pip install -e ." >&2
  exit 1
fi

if [[ ! -S /var/run/arduino-router.sock ]]; then
  echo "Arduino Router socket is unavailable: /var/run/arduino-router.sock" >&2
  exit 1
fi

if ! qf-stage1 check --timeout 2; then
  echo "Stage 1 MCU methods are unavailable; recover or re-upload the firmware" >&2
  exit 1
fi

output_dir="data/raw/smoke/$run_label"
if [[ -e "$output_dir" ]]; then
  echo "refusing to overwrite existing run directory: $output_dir" >&2
  exit 1
fi

mkdir -p "$output_dir"
bash scripts/capture-stage1-environment.sh "$output_dir/environment.txt"

qf-stage1 run roundtrip \
  --payload-size "$payload_size" \
  --iterations "$iterations" \
  --warmup "$warmup" \
  --output "$output_dir/roundtrip.jsonl"

qf-stage1 run reverse \
  --iterations "$iterations" \
  --warmup "$warmup" \
  --output "$output_dir/reverse.jsonl"

qf-stage1 run clock \
  --iterations "$iterations" \
  --warmup "$warmup" \
  --output "$output_dir/clock.jsonl"

qf-stage1 run matrix \
  --iterations "$iterations" \
  --warmup "$warmup" \
  --output "$output_dir/matrix.jsonl"

echo "Stage 1 smoke tests passed; results: $output_dir"
