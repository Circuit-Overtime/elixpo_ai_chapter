#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

condition="${1:-idle}"
run_label="${2:-$(date --utc +%Y%m%dT%H%M%SZ)}"
repetitions="${QF_REPETITIONS:-3}"
iterations="${QF_ITERATIONS:-1000}"
warmup="${QF_WARMUP:-100}"
payload_size="${QF_PAYLOAD_SIZE:-8}"
timeout="${QF_TIMEOUT:-2}"
levels_value="${QF_CONCURRENCY_LEVELS:-1 2 4 8}"
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

for value in "$warmup" "$payload_size"; do
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "warmup and payload size must be nonnegative integers" >&2
    exit 1
  fi
done

if [[ ! "$timeout" =~ ^[0-9]+([.][0-9]+)?$ ]] || [[ "$timeout" == "0" ]]; then
  echo "timeout must be a positive number" >&2
  exit 1
fi

read -r -a levels <<<"$levels_value"
if ((${#levels[@]} == 0)); then
  echo "at least one concurrency level is required" >&2
  exit 1
fi
for workers in "${levels[@]}"; do
  if [[ ! "$workers" =~ ^[1-9][0-9]*$ ]]; then
    echo "concurrency levels must be positive integers" >&2
    exit 1
  fi
done

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

campaign_root="data/raw/concurrency/$condition/$run_label"
processed_root="data/processed/concurrency/$condition/$run_label"
if [[ -e "$campaign_root" || -e "$processed_root" ]]; then
  echo "refusing to overwrite an existing concurrency campaign: $condition/$run_label" >&2
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
  echo "payload_size=$payload_size"
  echo "timeout=$timeout"
  echo "concurrency_levels=${levels[*]}"
  echo "load_description=$load_description"
} >"$campaign_root/campaign.txt"

for ((repetition = 1; repetition <= repetitions; repetition += 1)); do
  repetition_label="$(printf 'repetition-%02d' "$repetition")"
  raw_root="$campaign_root/$repetition_label"
  summary_root="$processed_root/$repetition_label"
  mkdir -p "$raw_root" "$summary_root"

  for workers in "${levels[@]}"; do
    workers_label="$(printf 'workers-%02d' "$workers")"
    echo "starting $condition $repetition_label $workers_label"

    qf-stage1 resources \
      --timeout "$timeout" \
      --reset-after \
      --output "$raw_root/$workers_label-before.json" >/dev/null

    set +e
    qf-stage1 run concurrency \
      --workers "$workers" \
      --payload-size "$payload_size" \
      --iterations "$iterations" \
      --warmup "$warmup" \
      --timeout "$timeout" \
      --output "$raw_root/$workers_label.jsonl"
    measurement_status=$?
    set -e

    if ! qf-stage1 check --timeout "$timeout"; then
      echo "$repetition_label $workers_label left the Bridge unhealthy; stopping escalation" >&2
      exit 1
    fi

    qf-stage1 resources \
      --timeout "$timeout" \
      --output "$raw_root/$workers_label-after.json" >/dev/null

    if [[ -s "$raw_root/$workers_label.jsonl" ]]; then
      qf-stage1 analyze \
        --input "$raw_root/$workers_label.jsonl" \
        --json "$summary_root/$workers_label.json" \
        --csv "$summary_root/$workers_label.csv" >/dev/null
    fi

    if ((measurement_status != 0)); then
      echo "$repetition_label $workers_label exited with status $measurement_status; stopping escalation" >&2
      exit "$measurement_status"
    fi
  done
done

echo "Stage 1 concurrency campaign complete"
echo "raw results: $campaign_root"
echo "processed results: $processed_root"
