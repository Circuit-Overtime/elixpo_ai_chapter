#!/usr/bin/env bash
# Deploy mail.elixpo (Elixpo Mails) to Cloudflare.
#
# Usage:
#   ./deploy.sh                  — secrets + build + deploy (Pages)
#   ./deploy.sh worker           — deploy the SMTP sender Worker
#   ./deploy.sh secrets          — push .env.local secrets to the Pages project + Worker
#   ./deploy.sh build            — build for Cloudflare Pages (prod domain locked in)
#   ./deploy.sh deploy           — deploy built output to Pages
#   ./deploy.sh build deploy     — build then deploy (skip secrets)
#   ./deploy.sh all              — worker + secrets + build + deploy
#
# Everything is read from .env.local (gitignored). Two keys carry the PROD values
# that differ from dev:
#   APP_URL (below)        → pushed as NEXT_PUBLIC_APP_URL  (dev .env.local is localhost)
#   SMTP_SENDER_LIVE_URL   → pushed as SMTP_SENDER_URL      (dev SMTP_SENDER_URL is localhost)
# No secret values live in this script or in git.

set -euo pipefail

PROJECT="elixpo-mail"
ENV_FILE=".env.local"
WORKER_DIR="workers/smtp-sender"
APP_URL="https://mails.elixpo.com"        # locked prod NEXT_PUBLIC_APP_URL

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Read a raw value out of .env.local (strips surrounding quotes).
envval() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

# Prod Worker URL comes from SMTP_SENDER_LIVE_URL in .env.local.
PROD_SMTP_SENDER_URL="$(envval SMTP_SENDER_LIVE_URL)"

# Vars handled EXPLICITLY or not pushed as runtime secrets:
#  - NEXT_PUBLIC_APP_URL  : pushed explicitly with the PROD url (.env.local is localhost)
#  - SMTP_SENDER_URL      : dev localhost — skipped; prod URL pushed from SMTP_SENDER_LIVE_URL
#  - SMTP_SENDER_LIVE_URL : source of the prod Worker URL — not a runtime var itself
#  - other NEXT_PUBLIC_*  : baked into the client at build time
#  - ENVIRONMENT/NODE_ENV : from wrangler.toml [env.production]
#  - CLOUDFLARE_*         : local REST-fallback creds only (prod uses bindings)
skip_var() {
  case "$1" in
    # env.ts reads these SERVER-SIDE at runtime via dynamic getEnv(), which Next
    # does NOT inline — so they must exist as runtime Pages vars. Same value
    # local/prod, so push straight from .env.local.
    NEXT_PUBLIC_ELIXPO_CLIENT_ID|NEXT_PUBLIC_ACCOUNTS_URL|NEXT_PUBLIC_GOOGLE_CLIENT_ID)
      return 1 ;;
    NEXT_PUBLIC_APP_URL|SMTP_SENDER_URL|SMTP_SENDER_LIVE_URL|\
    NEXT_PUBLIC_*|ENVIRONMENT|NODE_ENV|\
    CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_DATABASE_ID|CLOUDFLARE_KV_NAMESPACE_ID)
      return 0 ;;
    *) return 1 ;;
  esac
}

put_secret() {  # NAME VALUE
  local name="$1" value="${2:-}"
  [ -z "$value" ] && { echo "  Skipping (empty): $name"; return; }
  echo "  Setting: $name"
  # printf (no trailing newline) — `echo` would append \n and corrupt the secret.
  printf '%s' "$value" | npx wrangler pages secret put "$name" --project-name "$PROJECT" 2>&1 | tail -1
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
    printf '%s' "$value" | npx wrangler pages secret put "$key" --project-name "$PROJECT" 2>&1 | tail -1
    count=$((count + 1))
  done < "$ENV_FILE"

  # Explicit prod-value vars.
  put_secret NEXT_PUBLIC_APP_URL "$APP_URL"   # prod domain, not the localhost in .env.local
  if [ -z "$PROD_SMTP_SENDER_URL" ] || printf '%s' "$PROD_SMTP_SENDER_URL" | grep -q "localhost"; then
    echo "  !! SMTP_SENDER_LIVE_URL missing/localhost in .env.local — set the prod Worker URL, then re-run 'secrets'"
  else
    put_secret SMTP_SENDER_URL "$PROD_SMTP_SENDER_URL"   # value of SMTP_SENDER_LIVE_URL
  fi

  # The Worker needs the same shared secret the Pages app sends.
  local wsec; wsec="$(envval SMTP_SENDER_SECRET)"
  if [ -n "$wsec" ]; then
    echo "=== Pushing Worker secret (SMTP_SENDER_SECRET) ==="
    ( cd "$WORKER_DIR" && printf '%s' "$wsec" | npx wrangler secret put SMTP_SENDER_SECRET 2>&1 | tail -1 )
  fi
  echo "Done."
  echo ""
}

do_worker() {
  echo "=== Deploying SMTP sender Worker ==="
  ( cd "$WORKER_DIR" && npx wrangler deploy )
  echo "Ensure SMTP_SENDER_LIVE_URL in .env.local matches its https://…workers.dev URL, then run './deploy.sh secrets'."
  echo ""
}

do_build() {
  echo "=== Building for Cloudflare Pages (NEXT_PUBLIC_APP_URL=$APP_URL) ==="
  NEXT_PUBLIC_APP_URL="$APP_URL" npm run pages:build
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
    worker)  do_worker ;;
    secrets) push_secrets ;;
    build)   do_build ;;
    deploy)  do_deploy ;;
    all)     do_worker; push_secrets; do_build; do_deploy ;;
    *) echo "Unknown command: $cmd"; echo "Usage: ./deploy.sh [worker|secrets|build|deploy|all]"; exit 1 ;;
  esac
done
