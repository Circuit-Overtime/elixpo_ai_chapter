#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_DIR/workers/dashboard-api"
PAGES_PROJECT="agent-elixpo-web"
PAGES_BRANCH="${PAGES_BRANCH:-main}"

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [deploy|pages|worker|all|build|status]

  deploy  Run the package deploy script exactly as `npm run deploy` (default)
  pages   Build and deploy with explicit project and production-branch handling
  worker  Deploy the read-only agent-elixpo-api Worker
  all     Deploy the API Worker, then the Pages frontend
  build   Build and validate the static export without deploying
  status  Check the public frontend and API health endpoints

The dashboard token is a Worker secret. Set it separately from workers/dashboard-api:
  npx wrangler secret put ELIXPO_DASHBOARD_GITHUB_TOKEN
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' is not available." >&2
    exit 1
  fi
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return
  fi
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    source "$NVM_DIR/nvm.sh"
    nvm use --silent default >/dev/null 2>&1 || nvm use --silent node >/dev/null 2>&1 || true
  fi
  require_command node
  require_command npm
  require_command npx
}

ensure_dependencies() {
  local directory="$1"
  if [ ! -d "$directory/node_modules" ]; then
    echo "==> Installing dependencies in ${directory#$REPO_DIR/}/"
    (cd "$directory" && npm ci)
  fi
}

build_pages() {
  ensure_node
  ensure_dependencies "$SCRIPT_DIR"
  echo "==> Building static Next.js frontend"
  (cd "$SCRIPT_DIR" && npm run build)
  if [ ! -s "$SCRIPT_DIR/out/index.html" ]; then
    echo "Error: static export is missing out/index.html; refusing to deploy an empty site." >&2
    exit 1
  fi
  local file_count
  file_count="$(find "$SCRIPT_DIR/out" -type f | wc -l | tr -d ' ')"
  echo "==> Static export ready: $file_count files"
}

ensure_pages_project() {
  if npx wrangler pages project list 2>/dev/null | grep -Fq "$PAGES_PROJECT"; then
    return
  fi
  echo "==> Creating Cloudflare Pages project $PAGES_PROJECT"
  npx wrangler pages project create "$PAGES_PROJECT" --production-branch "$PAGES_BRANCH"
}

deploy_package() {
  ensure_node
  ensure_dependencies "$SCRIPT_DIR"
  echo "==> Running package deployment: npm run deploy"
  (cd "$SCRIPT_DIR" && npm run deploy)
}

deploy_pages() {
  build_pages
  echo "==> Deploying out/ to Cloudflare Pages project $PAGES_PROJECT"
  cd "$SCRIPT_DIR"
  ensure_pages_project
  npx wrangler pages deploy out \
    --project-name "$PAGES_PROJECT" \
    --branch "$PAGES_BRANCH" \
    --commit-dirty=true
}

deploy_worker() {
  ensure_node
  if [ ! -f "$API_DIR/wrangler.jsonc" ]; then
    echo "Error: dashboard API Worker configuration is missing." >&2
    exit 1
  fi
  ensure_dependencies "$API_DIR"
  echo "==> Deploying dashboard API Worker agent-elixpo-api"
  (cd "$API_DIR" && npx wrangler deploy)
}

status() {
  require_command curl
  echo "==> Frontend"
  curl --fail --silent --show-error --location --output /dev/null --write-out '%{http_code} %{url_effective}\n' https://agent.elixpo.com/
  echo "==> Dashboard API"
  curl --fail --silent --show-error https://agent.elixpo.com/api/health
  printf '\n'
}

command="${1:-deploy}"
case "$command" in
  deploy) deploy_package ;;
  pages) deploy_pages ;;
  worker) deploy_worker ;;
  all) deploy_worker; deploy_pages ;;
  build) build_pages ;;
  status) status ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
