#!/usr/bin/env bash
# Deploy Elixpo Admin to Cloudflare Pages.
#
# Usage:
#   ./deploy.sh              — secrets + build + deploy
#   ./deploy.sh secrets      — push .env.local secrets to Cloudflare Pages
#   ./deploy.sh build        — build for Cloudflare Pages (next-on-pages)
#   ./deploy.sh deploy       — deploy built output to Cloudflare Pages
#   ./deploy.sh build deploy — build then deploy (skip secrets)
#
# Reads plaintext vars from .env.local (decrypt first with
# `./sops-reencrypt.sh --decrypt` if you only have the encrypted .env).
# NEXT_PUBLIC_* are baked at build time; make sure .env.local holds the
# PROD values (https URLs) before building/deploying.

set -euo pipefail

PROJECT="admin"
ENV_FILE=".env.local"

# Vars NOT pushed as runtime Pages secrets:
#  - ENVIRONMENT / NODE_ENV : defined in wrangler.toml [env.production]
#  - CLOUDFLARE_*           : local REST-fallback creds only (prod uses bindings/CF_*)
#
# ALL NEXT_PUBLIC_* are pushed as runtime secrets. This app reads them
# SERVER-SIDE at runtime via dynamic env access (accounts URL, app URL, OAuth
# redirect URI), which Next does NOT inline — so they must exist as runtime
# Pages vars in production. Make sure .env.local holds the PROD values
# (e.g. NEXT_PUBLIC_REDIRECT_URL=https://admin.elixpo.com/api/auth/callback)
# before deploying.
skip_var() {
  case "$1" in
    NEXT_PUBLIC_*)
      return 1 ;;
    ENVIRONMENT|NODE_ENV|\
    CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_KV_NAMESPACE_ID)
      return 0 ;;
    *) return 1 ;;
  esac
}

push_secrets() {
  [ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found"; exit 1; }
  echo "=== Pushing secrets to Cloudflare Pages ($PROJECT) ==="
  count=0
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    value="${value#\"}"; value="${value%\"}"
    skip_var "$key" && continue
    [[ -z "$value" ]] && { echo "  Skipping (empty): $key"; continue; }
    echo "  Setting: $key"
    echo "$value" | npx wrangler pages secret put "$key" --project-name "$PROJECT" 2>&1 | tail -1
    count=$((count + 1))
  done < "$ENV_FILE"
  echo "Pushed $count secrets."
  echo ""
}

do_build() {
  echo "=== Building for Cloudflare Pages ==="
  npm run pages:build
  echo "Build complete."
  echo ""
}

do_deploy() {
  [ -d ".vercel/output/static" ] || { echo "Error: .vercel/output/static not found. Run './deploy.sh build' first."; exit 1; }
  echo "=== Deploying to Cloudflare Pages ==="
  BRANCH="${DEPLOY_BRANCH:-main}"
  echo "  Branch: $BRANCH"
  npx wrangler pages deploy ./.vercel/output/static --project-name "$PROJECT" --branch "$BRANCH"
  echo "Deploy complete."
  echo ""
}

if [ $# -eq 0 ]; then
  push_secrets; do_build; do_deploy; exit 0
fi
for cmd in "$@"; do
  case "$cmd" in
    secrets) push_secrets ;;
    build)   do_build ;;
    deploy)  do_deploy ;;
    *) echo "Unknown command: $cmd"; echo "Usage: ./deploy.sh [secrets] [build] [deploy]"; exit 1 ;;
  esac
done
