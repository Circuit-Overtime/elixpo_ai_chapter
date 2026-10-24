#!/usr/bin/env bash

set -euo pipefail

EXPORT_DIR="out"
OPTIMIZER="scripts/optimize-deploy-media.mjs"

usage() {
  echo "Usage: ./deploy.sh [optimize] [build] [deploy]"
  echo "  optimize - Compress media in the generated $EXPORT_DIR/ export"
  echo "  build    - Run next build, then optimize the static export"
  echo "  deploy   - Deploy $EXPORT_DIR/ to Cloudflare Pages via wrangler"
  echo "  Commands can be combined: ./deploy.sh build deploy"
  exit 1
}

optimize_export() {
  if [ ! -d "$EXPORT_DIR" ]; then
    echo "Error: $EXPORT_DIR/ directory not found. Run ./deploy.sh build first."
    exit 1
  fi
  echo ">> Checking exported media..."
  node "$OPTIMIZER" "$EXPORT_DIR"
}

if [ $# -eq 0 ]; then
  usage
fi

for cmd in "$@"; do
  case "$cmd" in
    optimize)
      optimize_export
      ;;
    build)
      echo ">> Building Next.js static export..."
      npx next build
      rm -f "$EXPORT_DIR/.media-optimized"
      optimize_export
      echo ">> Build complete. Output in $EXPORT_DIR/"
      ;;
    deploy)
      optimize_export
      echo ">> Deploying to Cloudflare Pages..."
      npx --yes wrangler pages deploy "$EXPORT_DIR" --project-name=elixpome
      echo ">> Deploy complete."
      ;;
    *)
      echo "Unknown command: $cmd"
      usage
      ;;
  esac
done
