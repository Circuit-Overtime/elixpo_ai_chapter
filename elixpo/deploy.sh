#!/bin/bash
set -e

PROJECT_NAME="elixpo"
BUILD_DIR="out"

usage() {
  echo "Usage: ./deploy.sh <command> [command...]"
  echo "  build   - Build the static site using Next.js"
  echo "  deploy  - Deploy the built site to Cloudflare Pages"
  echo ""
  echo "Examples:"
  echo "  ./deploy.sh build"
  echo "  ./deploy.sh deploy"
  echo "  ./deploy.sh build deploy"
  exit 1
}

build() {
  echo "Building static site..."
   rm -rf "$BUILD_DIR" .next
   npx next build
  echo "Build complete. Output in $BUILD_DIR/"
}

deploy() {
  if [ ! -d "$BUILD_DIR" ]; then
    echo "Error: $BUILD_DIR/ not found. Run './deploy.sh build' first."
    exit 1
  fi
  echo "Deploying to Cloudflare Pages..."
   npx wrangler pages deploy "$BUILD_DIR" --project-name="$PROJECT_NAME"
  echo "Deploy complete."
}

if [ $# -eq 0 ]; then
  usage
fi

for arg in "$@"; do
  case "$arg" in
    build)
      build
      ;;
    deploy)
      deploy
      ;;
    *)
      echo "Unknown command: $arg"
      usage
      ;;
  esac
done
