#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

governor="${1:-performance}"
condition="${2:-idle}"
run_label="${3:-$(date --utc +%Y%m%dT%H%M%SZ)}"

if [[ ! "$governor" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "governor may contain only letters, numbers, underscores, and hyphens" >&2
  exit 1
fi

case "$condition" in
  idle | cpu-loaded) ;;
  *)
    echo "condition must be idle or cpu-loaded" >&2
    exit 1
    ;;
esac

if [[ ! "$run_label" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "run label may contain only letters, numbers, dots, underscores, and hyphens" >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is unavailable" >&2
  exit 1
fi

if ! command -v setsid >/dev/null 2>&1; then
  echo "setsid is unavailable" >&2
  exit 1
fi

if ! sudo -n true; then
  echo "sudo authorization is unavailable; run 'sudo -v' before starting this script" >&2
  exit 1
fi

mapfile -t policies < <(compgen -G '/sys/devices/system/cpu/cpufreq/policy*' | sort)
if ((${#policies[@]} == 0)); then
  echo "no CPU frequency policies were found" >&2
  exit 1
fi

governor_state="$(mktemp)"
sudo_keeper_pid=""
campaign_pid=""

restore_governors() {
  local exit_code=$?
  local restore_failed=0
  trap - EXIT INT TERM HUP

  if [[ -n "$campaign_pid" ]] && kill -0 "$campaign_pid" 2>/dev/null; then
    kill -TERM -- "-$campaign_pid" 2>/dev/null || true
    wait "$campaign_pid" 2>/dev/null || true
  fi

  if [[ -n "$sudo_keeper_pid" ]] && kill -0 "$sudo_keeper_pid" 2>/dev/null; then
    kill -TERM "$sudo_keeper_pid" 2>/dev/null || true
    wait "$sudo_keeper_pid" 2>/dev/null || true
  fi

  while IFS=$'\t' read -r policy original_governor; do
    [[ -n "$policy" ]] || continue
    if printf '%s\n' "$original_governor" | sudo -n tee "$policy/scaling_governor" >/dev/null; then
      echo "restored $policy governor to $original_governor"
    else
      echo "failed to restore $policy governor to $original_governor" >&2
      restore_failed=1
    fi
  done <"$governor_state"
  rm -f "$governor_state"

  if ((restore_failed)); then
    exit 1
  fi
  exit "$exit_code"
}

trap restore_governors EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

for policy in "${policies[@]}"; do
  if [[ ! -r "$policy/scaling_governor" || ! -r "$policy/scaling_available_governors" ]]; then
    echo "CPU policy is missing governor controls: $policy" >&2
    exit 1
  fi

  original_governor="$(<"$policy/scaling_governor")"
  available_governors="$(<"$policy/scaling_available_governors")"
  if [[ " $available_governors " != *" $governor "* ]]; then
    echo "$governor is unavailable for $policy: $available_governors" >&2
    exit 1
  fi
  printf '%s\t%s\n' "$policy" "$original_governor" >>"$governor_state"
done

# Keep the non-interactive sudo ticket valid so cleanup can restore the original state.
(
  while kill -0 "$$" 2>/dev/null; do
    sleep 60
    sudo -n -v || exit 1
  done
) &
sudo_keeper_pid=$!

for policy in "${policies[@]}"; do
  printf '%s\n' "$governor" | sudo -n tee "$policy/scaling_governor" >/dev/null
  actual_governor="$(<"$policy/scaling_governor")"
  if [[ "$actual_governor" != "$governor" ]]; then
    echo "failed to set $policy governor to $governor; found $actual_governor" >&2
    exit 1
  fi
  echo "set $policy governor to $governor"
done

campaign_condition="$condition-$governor"
if [[ "$condition" == "idle" ]]; then
  setsid env QF_LOAD_DESCRIPTION="none; cpu_governor=$governor" \
    bash scripts/run-stage1-campaign.sh "$campaign_condition" "$run_label" &
else
  setsid env QF_CONDITION="$campaign_condition" \
    QF_LOAD_DESCRIPTION_SUFFIX="; cpu_governor=$governor" \
    bash scripts/run-stage1-loaded-campaign.sh "$run_label" &
fi
campaign_pid=$!

set +e
wait "$campaign_pid"
campaign_exit_code=$?
set -e
campaign_pid=""
exit "$campaign_exit_code"
