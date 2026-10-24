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
    # For CI, scope the check to the files changed on the current PR/branch
    # so the pipeline stays focused on the work being introduced.
    set -- .
    if [ -n "${GITHUB_BASE_REF:-}" ] && git rev-parse --verify --quiet "origin/${GITHUB_BASE_REF}" >/dev/null 2>&1; then
      changed_files=$(git diff --name-only --diff-filter=ACMR "origin/${GITHUB_BASE_REF}"...HEAD -- '*.js' '*.jsx' '*.ts' '*.tsx' '*.json' '*.jsonc' 2>/dev/null || true)
      if [ -n "$changed_files" ]; then
        set -- $changed_files
      fi
    fi

    if $BIOME ci "$@" --diagnostic-level=error >/tmp/biome-ci.out 2>&1; then
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
