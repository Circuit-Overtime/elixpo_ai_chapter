#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

run_label="${1:-stage6-recommendations-01}"
stage5_root="${QF_STAGE5_ROOT:-data/processed/stage5/stage5-contracts-01}"
operations="${QF_STAGE6_OPERATIONS:-config/stage6-operations.json}"
abi="${QF_ABI_SCHEMA:-config/qfabric-abi.json}"

if [[ ! "$run_label" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "run label may contain only letters, numbers, dots, underscores, and hyphens" >&2
  exit 1
fi
if ! command -v qf >/dev/null 2>&1; then
  echo "qf is unavailable; activate .venv and run: python -m pip install -e ." >&2
  exit 1
fi
for required in "$stage5_root/profile.json" "$stage5_root/linux-report.json" \
  "$stage5_root/rt-report.json" "$operations" "$abi"; do
  if [[ ! -f "$required" ]]; then
    echo "required Stage 6 input is missing: $required" >&2
    exit 1
  fi
done

output_root="data/processed/stage6/$run_label"
if [[ -e "$output_root" ]]; then
  echo "refusing to overwrite an existing Stage 6 audit: $output_root" >&2
  exit 1
fi
mkdir -p "$output_root"

qf recommend-input \
  --stage5-root "$stage5_root" \
  --abi "$abi" \
  --operations "$operations" \
  --output "$output_root/recommendation-input.json"

qf recommend \
  --input "$output_root/recommendation-input.json" \
  --output "$output_root/recommendations.json"

qf recommend add \
  --input "$output_root/recommendation-input.json" \
  --output "$output_root/filtered-recommendation.json"

qf recommend-scenarios \
  --input "$output_root/recommendation-input.json" \
  --output "$output_root/recommendation-scenarios.json"

qf recommend-audit \
  --root "$output_root" \
  --stage5-root "$stage5_root" \
  --abi "$abi" \
  --operations "$operations" \
  --output "$output_root/stage6-audit.json"

echo "Stage 6 recommendation audit complete"
echo "results: $output_root"
