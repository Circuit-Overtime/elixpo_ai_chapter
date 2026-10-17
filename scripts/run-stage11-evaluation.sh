#!/usr/bin/env bash
set -euo pipefail

campaign_id="${1:-stage11-evaluation-01}"
root="data/processed/stage11/${campaign_id}"
iterations="${QF_ITERATIONS:-1000}"
warmup="${QF_WARMUP:-100}"
observations="${QF_OBSERVATIONS:-1000}"
load_workers="${QF_LOAD_WORKERS:-8}"

command -v qf >/dev/null 2>&1 || {
  echo "qf is unavailable; activate the project virtual environment" >&2
  exit 1
}
command -v chrt >/dev/null 2>&1 || {
  echo "chrt is required for the SCHED_FIFO baseline" >&2
  exit 1
}
command -v stress-ng >/dev/null 2>&1 || {
  echo "stress-ng is required for the loaded tuned-Linux baseline" >&2
  exit 1
}
if [[ "$EUID" -ne 0 ]]; then
  echo "run with sudo -E so SCHED_FIFO can be applied" >&2
  exit 1
fi

mkdir -p "$root"
if [[ ! -f "$root/scheduler.json" ]]; then
  chrt -f 50 qf evaluate scheduler --output "$root/scheduler.json"
fi
if [[ ! -f "$root/tuned-linux-idle.json" ]]; then
  chrt -f 50 qf profile \
    --domain linux \
    --mode full \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --minimum-samples "$iterations" \
    --deadline-us 20000 \
    --output "$root/tuned-linux-idle.json"
fi

stress_log="$root/stress-ng.log"
stress_pid=""
stop_stress() {
  if [[ -n "$stress_pid" ]] && kill -0 "$stress_pid" 2>/dev/null; then
    kill -TERM "$stress_pid" 2>/dev/null || true
    wait "$stress_pid" 2>/dev/null || true
  fi
}
if [[ ! -f "$root/tuned-linux-loaded.json" ]]; then
  trap stop_stress EXIT
  stress-ng \
    --cpu "$load_workers" \
    --cpu-method all \
    --metrics-brief >"$stress_log" 2>&1 &
  stress_pid=$!
  sleep 5
  kill -0 "$stress_pid" 2>/dev/null || {
    echo "stress-ng stopped before the tuned loaded profile" >&2
    exit 1
  }
  chrt -f 50 qf profile \
    --domain linux \
    --mode full \
    --iterations "$iterations" \
    --warmup "$warmup" \
    --minimum-samples "$iterations" \
    --deadline-us 20000 \
    --output "$root/tuned-linux-loaded.json"
  stop_stress
  stress_pid=""
  trap - EXIT
fi

qf recommend-scenarios \
  --input data/processed/stage6/stage6-recommendations-01/recommendation-input.json \
  --output "$root/recommendation-scenarios.json"

qf evaluate run \
  --stage1 data/processed/campaigns/idle/initial-idle-04/repetition-01/roundtrip.json \
  --stage1 data/processed/campaigns/idle/initial-idle-04/repetition-02/roundtrip.json \
  --stage1 data/processed/campaigns/idle/initial-idle-04/repetition-03/roundtrip.json \
  --stage4-profile data/processed/stage4/profile-overhead.json \
  --loaded-linux data/processed/stage10/stage10-kernel-02/perf-loaded-01.json \
  --loaded-linux data/processed/stage10/stage10-kernel-02/perf-loaded-02.json \
  --loaded-linux data/processed/stage10/stage10-kernel-02/perf-loaded-03.json \
  --tuned-profile "$root/tuned-linux-idle.json" \
  --tuned-loaded-profile "$root/tuned-linux-loaded.json" \
  --scheduler "$root/scheduler.json" \
  --recovery-success data/processed/stage7/hardware-success.json \
  --recovery-rollback data/processed/stage7/hardware-rollback.json \
  --recommendation-input \
    data/processed/stage6/stage6-recommendations-01/recommendation-input.json \
  --recommendation-scenarios "$root/recommendation-scenarios.json" \
  --stage9-audit data/processed/stage9/stage9-visualization-01/stage9-audit.json \
  --stage10-audit data/processed/stage10/stage10-kernel-02/stage10-audit.json \
  --observations "$observations" \
  --output "$root/evaluation.json" \
  --table "$root/results.csv" \
  --figure "$root/flagship-p95.svg"

qf evaluate audit \
  --input "$root/evaluation.json" \
  --table "$root/results.csv" \
  --figure "$root/flagship-p95.svg" \
  --output "$root/stage11-audit.json"

{
  echo "campaign_id=$campaign_id"
  echo "iterations=$iterations"
  echo "warmup=$warmup"
  echo "observations=$observations"
  echo "seed=11012026"
  echo "load_workers=$load_workers"
  echo "kernel=$(uname -r)"
  echo "architecture=$(uname -m)"
  echo "python=$(python --version 2>&1)"
  echo "git_commit=$(git rev-parse HEAD)"
  printf 'command=sudo -E env PATH="$PATH" bash scripts/run-stage11-evaluation.sh %s\n' "$campaign_id"
} >"$root/campaign.txt"

owner="${SUDO_USER:-}"
if [[ -n "$owner" ]]; then
  chown -R "$owner":"$(id -gn "$owner")" "$root"
fi

echo "Stage 11 evaluation campaign complete"
echo "results: $root"
