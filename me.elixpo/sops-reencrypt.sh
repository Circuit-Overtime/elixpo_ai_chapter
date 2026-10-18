#!/bin/bash
# Re-encrypt .env from .env.local for one or all elixpo projects.
#
# Usage:
#   ./sops-reencrypt.sh                  # all projects
#   ./sops-reencrypt.sh blogs.elixpo     # single project
#   ./sops-reencrypt.sh --decrypt        # decrypt .env → .env.local for all
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"

PROJECTS=(".")

# Load AGE key
if [ -z "${SOPS_AGE_KEY:-}" ]; then
  if [ -f "$AGE_KEY_FILE" ]; then
    export SOPS_AGE_KEY=$(grep "AGE-SECRET-KEY" "$AGE_KEY_FILE" | head -1)
  else
    echo "ERROR: No AGE key found. Set SOPS_AGE_KEY or create $AGE_KEY_FILE"
    exit 1
  fi
fi

decrypt_mode=false
target=""

for arg in "$@"; do
  case "$arg" in
    --decrypt) decrypt_mode=true ;;
    *) target="$arg" ;;
  esac
done

if [ -n "$target" ]; then
  PROJECTS=("$target")
fi

for project in "${PROJECTS[@]}"; do
  dir="$SCRIPT_DIR/$project"

  if [ ! -d "$dir" ]; then
    echo "SKIP $project (directory not found)"
    continue
  fi

  if $decrypt_mode; then
    # Decrypt .env → .env.local
    if [ ! -f "$dir/.env" ]; then
      echo "SKIP $project (no .env)"
      continue
    fi
    echo -n "$project: decrypting .env → .env.local... "
    cd "$dir"
    sops decrypt .env > .env.local
    echo "✓"
    cd "$SCRIPT_DIR"
  else
    # Encrypt .env.local → .env
    if [ ! -f "$dir/.env.local" ]; then
      echo "SKIP $project (no .env.local)"
      continue
    fi
    echo -n "$project: encrypting .env.local → .env... "
    cp "$dir/.env.local" "$dir/.env"
    cd "$dir"
    sops encrypt -i .env
    echo "✓"
    cd "$SCRIPT_DIR"
  fi
done

echo "Done."
