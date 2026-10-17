#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

uv sync --group dev
uv run pyinstaller \
  --clean \
  --onefile \
  --name eeprom28c64 \
  --distpath dist \
  --workpath build/pyinstaller \
  --specpath build \
  src/eeprom28c64/__main__.py

cp LICENSE THIRD_PARTY_NOTICES.md dist/

echo "Built $repo_dir/dist/eeprom28c64"
echo "Release notices copied to $repo_dir/dist"
