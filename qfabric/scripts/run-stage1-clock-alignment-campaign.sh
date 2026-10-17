#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

run_label="${1:-$(date --utc +%Y%m%dT%H%M%SZ)}"
repetitions="${QF_REPETITIONS:-3}"
iterations="${QF_ITERATIONS:-600}"
warmup="${QF_WARMUP:-10}"
interval_ms="${QF_CLOCK_INTERVAL_MS:-500}"
timeout="${QF_TIMEOUT:-2}"

if [[ ! "$run_label" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "run label may contain only letters, numbers, dots, underscores, and hyphens" >&2
  exit 1
fi

for value in "$repetitions" "$iterations"; do
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "repetitions and iterations must be positive integers" >&2
    exit 1
  fi
done

for value in "$warmup" "$interval_ms"; do
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "warmup and clock interval must be nonnegative integers" >&2
    exit 1
  fi
done

if [[ ! "$timeout" =~ ^[0-9]+([.][0-9]+)?$ ]] || [[ "$timeout" == "0" ]]; then
  echo "timeout must be a positive number" >&2
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

if ! qf-stage1 check --timeout "$timeout"; then
  echo "Stage 1 MCU methods are unavailable; recover or re-upload the firmware" >&2
  exit 1
fi

campaign_root="data/raw/clock-alignment/$run_label"
processed_root="data/processed/clock-alignment/$run_label"
if [[ -e "$campaign_root" || -e "$processed_root" ]]; then
  echo "refusing to overwrite an existing clock campaign: $run_label" >&2
  exit 1
fi

mkdir -p "$campaign_root" "$processed_root"
bash scripts/capture-stage1-environment.sh "$campaign_root/environment.txt"

{
  echo "run_label=$run_label"
  echo "repetitions=$repetitions"
  echo "iterations=$iterations"
  echo "warmup=$warmup"
  echo "interval_ms=$interval_ms"
  echo "timeout=$timeout"
} >"$campaign_root/campaign.txt"

for ((repetition = 1; repetition <= repetitions; repetition += 1)); do
  repetition_label="$(printf 'repetition-%02d' "$repetition")"
  raw_path="$campaign_root/$repetition_label.jsonl"
  echo "starting clock alignment $repetition_label of $repetitions"

  qf-stage1 resources \
    --timeout "$timeout" \
    --reset-after \
    --output "$campaign_root/$repetition_label-before.json" >/dev/null

  set +e
  qf-stage1 run clock-align \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --interval-ms "$interval_ms" \
    --timeout "$timeout" \
    --output "$raw_path"
  measurement_status=$?
  set -e

  if ! qf-stage1 check --timeout "$timeout"; then
    echo "$repetition_label left the Bridge unhealthy; stopping campaign" >&2
    exit 1
  fi

  qf-stage1 resources \
    --timeout "$timeout" \
    --output "$campaign_root/$repetition_label-after.json" >/dev/null

  if [[ -s "$raw_path" ]]; then
    qf-stage1 analyze \
      --input "$raw_path" \
      --json "$processed_root/$repetition_label.json" \
      --csv "$processed_root/$repetition_label.csv" >/dev/null
  fi

  if ((measurement_status != 0)); then
    echo "$repetition_label exited with status $measurement_status; stopping campaign" >&2
    exit "$measurement_status"
  fi
done

echo "Stage 1 clock alignment campaign complete"
echo "raw results: $campaign_root"
echo "processed results: $processed_root"
