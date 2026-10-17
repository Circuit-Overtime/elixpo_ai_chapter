#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

if ! command -v qf >/dev/null 2>&1; then
  echo "qf is unavailable; activate .venv and run: python -m pip install -e ." >&2
  exit 1
fi

if [[ ! -S /var/run/arduino-router.sock ]]; then
  echo "Arduino Router socket is unavailable: /var/run/arduino-router.sock" >&2
  exit 1
fi

linux_result="$(qf run add --domain linux -- 2 3)"
rt_result="$(qf run add --domain rt -- 2 3)"

if [[ "$linux_result" != "5" || "$rt_result" != "5" ]]; then
  echo "domain result mismatch: linux=$linux_result rt=$rt_result" >&2
  exit 1
fi

for domain in linux rt; do
  error_file="$(mktemp)"
  if qf run add --domain "$domain" -- 2 > /dev/null 2>"$error_file"; then
    echo "$domain accepted an invalid invocation" >&2
    rm -f "$error_file"
    exit 1
  fi
  if ! grep -q "add requires exactly two signed 32-bit integer arguments" "$error_file"; then
    echo "$domain returned an unexpected validation error" >&2
    rm -f "$error_file"
    exit 1
  fi
  rm -f "$error_file"
done

echo "Stage 2 dual-domain smoke test passed: add(2, 3) = 5 on Linux and RT"
