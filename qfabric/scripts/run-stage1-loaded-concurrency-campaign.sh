#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

run_label="${1:-$(date --utc +%Y%m%dT%H%M%SZ)}"
cpu_workers="${QF_STRESS_CPU_WORKERS:-4}"
load_warmup_seconds="${QF_STRESS_WARMUP_SECONDS:-10}"
condition="${QF_CONDITION:-cpu-loaded}"
load_description_suffix="${QF_LOAD_DESCRIPTION_SUFFIX:-}"

for value in "$run_label" "$condition"; do
  if [[ ! "$value" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "condition and run label may contain only letters, numbers, dots, underscores, and hyphens" >&2
    exit 1
  fi
done

for value in "$cpu_workers" "$load_warmup_seconds"; do
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "CPU workers and load warmup must be positive integers" >&2
    exit 1
  fi
done

if ! command -v stress-ng >/dev/null 2>&1; then
  echo "stress-ng is unavailable; install it before running the loaded campaign" >&2
  exit 1
fi

stress_log="$(mktemp)"
stress_pid=""

stop_stress() {
  if [[ -n "$stress_pid" ]] && kill -0 "$stress_pid" 2>/dev/null; then
    kill -TERM "$stress_pid" 2>/dev/null || true
    wait "$stress_pid" 2>/dev/null || true
  fi
}

cleanup() {
  stop_stress
  rm -f "$stress_log"
}
trap cleanup EXIT INT TERM

stress-ng \
  --cpu "$cpu_workers" \
  --cpu-method all \
  --metrics-brief >"$stress_log" 2>&1 &
stress_pid=$!

sleep "$load_warmup_seconds"
if ! kill -0 "$stress_pid" 2>/dev/null; then
  echo "stress-ng stopped before the concurrency campaign began" >&2
  exit 1
fi

set +e
QF_LOAD_DESCRIPTION="stress-ng --cpu $cpu_workers --cpu-method all$load_description_suffix" \
  bash scripts/run-stage1-concurrency-campaign.sh "$condition" "$run_label"
campaign_exit_code=$?
set -e

stop_stress
stress_pid=""

campaign_root="data/raw/concurrency/$condition/$run_label"
if [[ -d "$campaign_root" ]]; then
  cp "$stress_log" "$campaign_root/stress-ng.log"
fi

exit "$campaign_exit_code"
