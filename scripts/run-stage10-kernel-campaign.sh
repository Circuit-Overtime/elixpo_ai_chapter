#!/usr/bin/env bash
set -euo pipefail

campaign_id="${1:-stage10-kernel-01}"
repetitions="${QF_REPETITIONS:-3}"
iterations="${QF_ITERATIONS:-500}"
warmup="${QF_WARMUP:-50}"
load_workers="${QF_LOAD_WORKERS:-8}"
root="data/processed/stage10/${campaign_id}"
stage4_profile="${QF_STAGE4_PROFILE:-data/processed/stage4/profile-overhead.json}"

command -v qf >/dev/null 2>&1 || {
  echo "qf is unavailable; activate the project virtual environment" >&2
  exit 1
}
command -v stress-ng >/dev/null 2>&1 || {
  echo "stress-ng is unavailable; install it before the loaded campaign" >&2
  exit 1
}
test -f "$stage4_profile" || {
  echo "Stage 4 reference profile is missing: $stage4_profile" >&2
  exit 1
}
if [[ "$EUID" -ne 0 ]]; then
  echo "run the Stage 10 campaign as root to collect kernel scheduler events" >&2
  exit 1
fi

mkdir -p "$root"
qf kernel capabilities --output "$root/capabilities.json"

baseline_arguments=()
perf_arguments=()
loaded_arguments=()
for repetition in $(seq 1 "$repetitions"); do
  label=$(printf "%02d" "$repetition")
  baseline="$root/baseline-${label}.json"
  perf="$root/perf-${label}.json"
  qf kernel benchmark \
    --include-kernel \
    --baseline \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --output "$baseline"
  qf kernel benchmark \
    --include-kernel \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --output "$perf"
  baseline_arguments+=(--baseline "$baseline")
  perf_arguments+=(--perf "$perf")
done

stress_log="$root/stress-ng.log"
stress_pid=""
stop_stress() {
  if [[ -n "$stress_pid" ]] && kill -0 "$stress_pid" 2>/dev/null; then
    kill -TERM "$stress_pid" 2>/dev/null || true
    wait "$stress_pid" 2>/dev/null || true
  fi
}
trap stop_stress EXIT

stress-ng \
  --cpu "$load_workers" \
  --cpu-method all \
  --metrics-brief >"$stress_log" 2>&1 &
stress_pid=$!
sleep 5
kill -0 "$stress_pid" 2>/dev/null || {
  echo "stress-ng stopped before the loaded campaign" >&2
  exit 1
}
for repetition in $(seq 1 "$repetitions"); do
  label=$(printf "%02d" "$repetition")
  loaded="$root/perf-loaded-${label}.json"
  qf kernel benchmark \
    --include-kernel \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --output "$loaded"
  loaded_arguments+=(--loaded-perf "$loaded")
done
stop_stress
stress_pid=""
trap - EXIT

qf kernel benchmark \
  --include-kernel \
  --injected-delay-ms 5 \
  --iterations 200 \
  --warmup 20 \
  --output "$root/accuracy-5ms.json"

qf kernel benchmark \
  --force-fallback \
  --iterations 100 \
  --warmup 10 \
  --output "$root/fallback.json"

qf kernel audit \
  --capabilities "$root/capabilities.json" \
  --stage4-profile "$stage4_profile" \
  "${baseline_arguments[@]}" \
  "${perf_arguments[@]}" \
  "${loaded_arguments[@]}" \
  --accuracy "$root/accuracy-5ms.json" \
  --fallback "$root/fallback.json" \
  --output "$root/stage10-audit.json"

echo "Stage 10 kernel campaign complete"
echo "results: $root"
