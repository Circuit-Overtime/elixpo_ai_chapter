#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

run_label="${1:-$(date --utc +%Y%m%dT%H%M%SZ)}"
repetitions="${QF_REPETITIONS:-3}"
iterations="${QF_ITERATIONS:-1000}"
warmup="${QF_WARMUP:-100}"
payload_size="${QF_PAYLOAD_SIZE:-8}"
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

campaign_root="data/raw/led-profiles/$run_label"
processed_root="data/processed/led-profiles/$run_label"
if [[ -e "$campaign_root" || -e "$processed_root" ]]; then
  echo "refusing to overwrite an existing LED profile campaign: $run_label" >&2
  exit 1
fi

mkdir -p "$campaign_root" "$processed_root"
bash scripts/capture-stage1-environment.sh "$campaign_root/environment.txt"

{
  echo "run_label=$run_label"
  echo "repetitions=$repetitions"
  echo "iterations=$iterations"
  echo "warmup=$warmup"
  echo "payload_size=$payload_size"
  echo "timeout=$timeout"
  echo "profiles=disabled static refresh-10hz refresh-30hz refresh-60hz"
} >"$campaign_root/campaign.txt"

profile_labels=(disabled static refresh-10hz refresh-30hz refresh-60hz)
profile_modes=(disabled static refresh refresh refresh)
profile_rates=(0 0 10 30 60)

for ((repetition = 1; repetition <= repetitions; repetition += 1)); do
  repetition_label="$(printf 'repetition-%02d' "$repetition")"
  raw_root="$campaign_root/$repetition_label"
  summary_root="$processed_root/$repetition_label"
  mkdir -p "$raw_root" "$summary_root"

  for index in "${!profile_labels[@]}"; do
    profile_label="${profile_labels[$index]}"
    profile_mode="${profile_modes[$index]}"
    profile_rate="${profile_rates[$index]}"
    echo "starting $repetition_label LED profile $profile_label"

    qf-stage1 resources \
      --timeout "$timeout" \
      --reset-after \
      --output "$raw_root/$profile_label-before.json" >/dev/null

    set +e
    qf-stage1 run led-profile \
      --led-mode "$profile_mode" \
      --refresh-hz "$profile_rate" \
      --payload-size "$payload_size" \
      --iterations "$iterations" \
      --warmup "$warmup" \
      --timeout "$timeout" \
      --output "$raw_root/$profile_label.jsonl" \
      --profile-output "$raw_root/$profile_label-profile.json"
    measurement_status=$?
    set -e

    if ! qf-stage1 check --timeout "$timeout"; then
      echo "$repetition_label $profile_label left the Bridge unhealthy; stopping campaign" >&2
      exit 1
    fi

    qf-stage1 resources \
      --timeout "$timeout" \
      --output "$raw_root/$profile_label-after.json" >/dev/null

    if [[ -s "$raw_root/$profile_label.jsonl" ]]; then
      qf-stage1 analyze \
        --input "$raw_root/$profile_label.jsonl" \
        --json "$summary_root/$profile_label.json" \
        --csv "$summary_root/$profile_label.csv" >/dev/null
    fi

    if ((measurement_status != 0)); then
      echo "$repetition_label $profile_label exited with status $measurement_status; stopping campaign" >&2
      exit "$measurement_status"
    fi
  done
done

echo "Stage 1 LED profile campaign complete"
echo "raw results: $campaign_root"
echo "processed results: $processed_root"
