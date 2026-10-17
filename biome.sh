#!/usr/bin/env bash
# biome.sh — fix Biome linting issues.
#
# Usage:
#   ./biome.sh         # fix everything (safe + unsafe writes). Quiet output.
#   ./biome.sh ci      # strict check. Prints PASS / FAIL verdict. Exit
#                      # non-zero only on real errors (infos + warns ignored).
#   ./biome.sh check   # full diagnostic report (incl. infos + warns). No writes.

set -e

MODE="${1:-fix}"
BIOME="npx --yes @biomejs/biome"

case "$MODE" in
  fix|"")
    # Run fixes but hide the long diagnostic spew — only show the summary
    # line (files checked / fixed). Real errors still surface; infos don't.
    echo "▶ Applying safe fixes…"
    $BIOME check . --write --max-diagnostics=5 2>&1 | tail -5 || true
    echo ""
    echo "▶ Applying unsafe fixes…"
    $BIOME check . --write --unsafe --max-diagnostics=5 2>&1 | tail -5 || true
    echo ""
    echo "✓ Done. Run './biome.sh ci' to verify the CI check will pass."
    ;;
  ci)
    # --diagnostic-level=error: infos + warnings don't fail the check.
    # Capture output + check exit so we can print a clean verdict.
    if $BIOME ci . --diagnostic-level=error >/tmp/biome-ci.out 2>&1; then
      echo "✓ biome ci — PASS (no errors)"
      # Show summary line for visibility
      grep -E "Checked [0-9]+ files" /tmp/biome-ci.out | tail -1 || true
    else
      echo "✖ biome ci — FAIL (errors present)"
      cat /tmp/biome-ci.out
      exit 1
    fi
    ;;
  check)
    $BIOME check . --max-diagnostics=200
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Usage: ./biome.sh [fix|ci|check]"
    exit 2
    ;;
esac
