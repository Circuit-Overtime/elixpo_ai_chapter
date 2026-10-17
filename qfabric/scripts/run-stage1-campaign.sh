#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

condition="${1:-idle}"
run_label="${2:-$(date --utc +%Y%m%dT%H%M%SZ)}"
repetitions="${QF_REPETITIONS:-3}"
iterations="${QF_ITERATIONS:-1000}"
warmup="${QF_WARMUP:-100}"
load_description="${QF_LOAD_DESCRIPTION:-none}"

for value in "$condition" "$run_label"; do
  if [[ ! "$value" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "condition and run label may contain only letters, numbers, dots, underscores, and hyphens" >&2
    exit 1
  fi
done

for value in "$repetitions" "$iterations"; do
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "repetitions and iterations must be positive integers" >&2
    exit 1
  fi
done

if [[ ! "$warmup" =~ ^[0-9]+$ ]]; then
  echo "warmup must be a nonnegative integer" >&2
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

campaign_root="data/raw/campaigns/$condition/$run_label"
processed_root="data/processed/campaigns/$condition/$run_label"
if [[ -e "$campaign_root" || -e "$processed_root" ]]; then
  echo "refusing to overwrite an existing campaign: $condition/$run_label" >&2
  exit 1
fi

mkdir -p "$campaign_root" "$processed_root"
bash scripts/capture-stage1-environment.sh "$campaign_root/environment.txt"

{
  echo "condition=$condition"
  echo "run_label=$run_label"
  echo "repetitions=$repetitions"
  echo "iterations=$iterations"
  echo "warmup=$warmup"
  echo "load_description=$load_description"
} >"$campaign_root/campaign.txt"

sample_failures=0

run_measurement() {
  local exit_code
  set +e
  "$@"
  exit_code=$?
  set -e

  case "$exit_code" in
    0) ;;
    2)
      sample_failures=1
      echo "measurement completed with one or more failed samples" >&2
      ;;
    *)
      echo "measurement infrastructure failed with exit code $exit_code" >&2
      exit "$exit_code"
      ;;
  esac
}

for ((repetition = 1; repetition <= repetitions; repetition += 1)); do
  repetition_label="$(printf 'repetition-%02d' "$repetition")"
  raw_root="$campaign_root/$repetition_label"
  summary_root="$processed_root/$repetition_label"
  mkdir -p "$raw_root" "$summary_root"

  echo "starting $condition $repetition_label of $repetitions"

  run_measurement env QF_ITERATIONS="$iterations" QF_WARMUP="$warmup" \
    bash scripts/run-stage1-payload-sweep.sh \
    config/stage1-payload-sizes.txt "$raw_root/roundtrip.jsonl"

  run_measurement qf-stage1 run reverse \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --output "$raw_root/reverse.jsonl"

  run_measurement qf-stage1 run clock \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --output "$raw_root/clock.jsonl"

  run_measurement qf-stage1 run matrix \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --output "$raw_root/matrix.jsonl"

  for experiment in roundtrip reverse clock matrix; do
    qf-stage1 analyze \
      --input "$raw_root/$experiment.jsonl" \
      --json "$summary_root/$experiment.json" \
      --csv "$summary_root/$experiment.csv" >/dev/null
  done
done

echo "Stage 1 campaign complete"
echo "raw results: $campaign_root"
echo "processed results: $processed_root"

if ((sample_failures)); then
  echo "campaign contains failed samples; retain them for saturation analysis" >&2
  exit 2
fi
