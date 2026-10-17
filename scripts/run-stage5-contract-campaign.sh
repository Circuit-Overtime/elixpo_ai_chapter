#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

run_label="${1:-$(date --utc +%Y%m%dT%H%M%SZ)}"
iterations="${QF_ITERATIONS:-1000}"
warmup="${QF_WARMUP:-100}"
deadline_us="${QF_DEADLINE_US:-20000}"
window_size="${QF_WINDOW_SIZE:-100}"
minimum_samples="${QF_MINIMUM_SAMPLES:-50}"
max_miss_rate_pct="${QF_MAX_MISS_RATE_PCT:-1.0}"
at_risk_miss_rate_pct="${QF_AT_RISK_MISS_RATE_PCT:-0.5}"
recovery_miss_rate_pct="${QF_RECOVERY_MISS_RATE_PCT:-0.25}"
violation_windows="${QF_VIOLATION_WINDOWS:-3}"
recovery_windows="${QF_RECOVERY_WINDOWS:-3}"
infeasible_windows="${QF_INFEASIBLE_WINDOWS:-5}"
timeout="${QF_TIMEOUT:-2}"
sensitivity_windows="${QF_SENSITIVITY_WINDOWS:-50,100,200}"
sensitivity_violation="${QF_SENSITIVITY_VIOLATION_WINDOWS:-1,2,3}"
sensitivity_recovery="${QF_SENSITIVITY_RECOVERY_WINDOWS:-1,2,3}"

if [[ ! "$run_label" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "run label may contain only letters, numbers, dots, underscores, and hyphens" >&2
  exit 1
fi
for value in "$iterations" "$deadline_us" "$window_size" "$minimum_samples" \
  "$violation_windows" "$recovery_windows" "$infeasible_windows"; do
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "integer campaign settings must be positive" >&2
    exit 1
  fi
done
if [[ ! "$warmup" =~ ^[0-9]+$ ]]; then
  echo "warmup must be a nonnegative integer" >&2
  exit 1
fi
if ((minimum_samples > window_size)); then
  echo "minimum samples must not exceed the contract window" >&2
  exit 1
fi
if ((iterations < 1000)); then
  echo "the Stage 5 completion campaign requires at least 1000 retained samples" >&2
  exit 1
fi
if ! command -v qf >/dev/null 2>&1; then
  echo "qf is unavailable; activate .venv and run: python -m pip install -e ." >&2
  exit 1
fi
if [[ ! -S /var/run/arduino-router.sock ]]; then
  echo "Arduino Router socket is unavailable: /var/run/arduino-router.sock" >&2
  exit 1
fi
if [[ ! -x build/stage4/linux/qf-profile-linux ]]; then
  echo "Stage 4 Linux profile runner is missing or not executable" >&2
  exit 1
fi

output_root="data/processed/stage5/$run_label"
if [[ -e "$output_root" ]]; then
  echo "refusing to overwrite an existing Stage 5 campaign: $output_root" >&2
  exit 1
fi
mkdir -p "$output_root"

{
  echo "run_label=$run_label"
  echo "iterations=$iterations"
  echo "warmup=$warmup"
  echo "deadline_us=$deadline_us"
  echo "window_size=$window_size"
  echo "minimum_samples=$minimum_samples"
  echo "max_miss_rate_pct=$max_miss_rate_pct"
  echo "at_risk_miss_rate_pct=$at_risk_miss_rate_pct"
  echo "recovery_miss_rate_pct=$recovery_miss_rate_pct"
  echo "violation_windows=$violation_windows"
  echo "recovery_windows=$recovery_windows"
  echo "infeasible_windows=$infeasible_windows"
  echo "sensitivity_windows=$sensitivity_windows"
  echo "sensitivity_violation_windows=$sensitivity_violation"
  echo "sensitivity_recovery_windows=$sensitivity_recovery"
} >"$output_root/campaign.txt"

qf profile \
  --domain both \
  --mode full \
  --iterations "$iterations" \
  --warmup "$warmup" \
  --capacity "$iterations" \
  --minimum-samples "$iterations" \
  --deadline-us "$deadline_us" \
  --timeout "$timeout" \
  --output "$output_root/profile.json"

for domain in linux rt; do
  qf contract trace \
    --profile "$output_root/profile.json" \
    --task add \
    --domain "$domain" \
    --mode full \
    --deadline-us "$deadline_us" \
    --window-size "$window_size" \
    --minimum-samples "$minimum_samples" \
    --warmup-samples 0 \
    --max-miss-rate-pct "$max_miss_rate_pct" \
    --at-risk-miss-rate-pct "$at_risk_miss_rate_pct" \
    --recovery-miss-rate-pct "$recovery_miss_rate_pct" \
    --violation-windows "$violation_windows" \
    --recovery-windows "$recovery_windows" \
    --infeasible-windows "$infeasible_windows" \
    --output "$output_root/$domain-trace.json"

  qf contract replay \
    --input "$output_root/$domain-trace.json" \
    --output "$output_root/$domain-report.json"

  qf contract sensitivity \
    --input "$output_root/$domain-trace.json" \
    --window-sizes "$sensitivity_windows" \
    --violation-windows "$sensitivity_violation" \
    --recovery-windows "$sensitivity_recovery" \
    --output "$output_root/$domain-sensitivity.json"

  qf contract scenario \
    --input "$output_root/$domain-trace.json" \
    --trace-output "$output_root/$domain-injected-trace.json" \
    --report-output "$output_root/$domain-scenario.json"
done

qf contract audit \
  --root "$output_root" \
  --output "$output_root/stage5-audit.json" \
  --minimum-hardware-observations 1000

echo "Stage 5 contract campaign complete"
echo "results: $output_root"
