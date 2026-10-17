#!/usr/bin/env bash
set -euo pipefail

output_path="${1:-data/raw/environment.txt}"
mkdir -p "$(dirname "$output_path")"

{
  echo "captured_utc=$(date --utc --iso-8601=seconds)"
  echo
  echo "[uname]"
  uname -a
  echo
  echo "[os-release]"
  sed -n '1,120p' /etc/os-release
  echo
  echo "[python]"
  python3 --version
  echo
  echo "[arduino-cli]"
  if command -v arduino-cli >/dev/null 2>&1; then
    arduino-cli version
  else
    echo "not installed in the UNO Q Linux environment; compile and upload from the workstation"
  fi
  echo
  echo "[router-status]"
  systemctl --no-pager --full status arduino-router || true
  echo
  echo "[router-command]"
  systemctl show arduino-router --property=ExecStart --no-pager || true
  echo
  echo "[router-socket]"
  stat /var/run/arduino-router.sock || true
  echo
  echo "[cpu]"
  lscpu
  echo
  echo "[memory]"
  free -h
  echo
  echo "[cpu-frequency]"
  for policy in /sys/devices/system/cpu/cpufreq/policy*; do
    if [[ ! -d "$policy" ]]; then
      continue
    fi
    echo "policy=$policy"
    for attribute in \
      scaling_governor \
      scaling_available_governors \
      scaling_min_freq \
      scaling_max_freq \
      scaling_cur_freq \
      cpuinfo_min_freq \
      cpuinfo_max_freq; do
      if [[ -r "$policy/$attribute" ]]; then
        echo "$attribute=$(<"$policy/$attribute")"
      fi
    done
  done
  echo
  echo "[thermal-zones]"
  for zone in /sys/class/thermal/thermal_zone*; do
    if [[ -r "$zone/type" && -r "$zone/temp" ]]; then
      echo "$(<"$zone/type")=$(<"$zone/temp")"
    fi
  done
  echo
  echo "[qfabric-repository]"
  git rev-parse HEAD
  git status --short
} >"$output_path" 2>&1

echo "wrote $output_path"
