#!/usr/bin/env bash
# Deploy Elixpo Status to Cloudflare Pages (project: status → status.pages.dev,
# custom domain status.elixpo.com).
#
# Usage:
#   ./deploy.sh              — secrets + build + deploy
#   ./deploy.sh secrets      — push runtime secrets from .env.local to Pages
#   ./deploy.sh build        — build for Cloudflare Pages (next-on-pages)
#   ./deploy.sh deploy       — deploy the built output to Pages
#   ./deploy.sh build deploy — build then deploy (skip secrets)
#
# Reads plaintext vars from .env.local. If you only have the encrypted .env,
# decrypt first with `./sops-reencrypt.sh --decrypt`.
#
# The status page is read-only: it needs a scoped Cloudflare token + account id
# at runtime to call the REST/GraphQL analytics APIs. There are no NEXT_PUBLIC_*
# or app-specific secrets to bake in.

set -euo pipefail

PROJECT="status"
ENV_FILE=".env.local"

# Vars NOT pushed as runtime secrets:
#  - CLOUDFLARE_API_TOKEN : this is the wrangler/CI token used to perform THIS
#    deploy (wrangler reads it from the environment). It is not what the running
#    app uses to read analytics, so it must not become a runtime Pages secret.
# Everything else in .env.local IS pushed — notably:
#  - CF_API_TOKEN / CF_ACCOUNT_ID         : scoped read token the app uses live
#  - CLOUDFLARE_ACCOUNT_ID                : account-id fallback used by the app
skip_var() {
  case "$1" in
    CLOUDFLARE_API_TOKEN) return 0 ;;
    *) return 1 ;;
  esac
}

push_secrets() {
  [ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found"; exit 1; }
  echo "=== Pushing runtime secrets to Cloudflare Pages ($PROJECT) ==="
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
  echo "=== Building for Cloudflare Pages (next-on-pages) ==="
  npm run pages:build
  echo "Build complete."
  echo ""
}

do_deploy() {
  [ -d ".vercel/output/static" ] || { echo "Error: .vercel/output/static not found. Run './deploy.sh build' first."; exit 1; }
  echo "=== Deploying to Cloudflare Pages ($PROJECT) ==="
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
