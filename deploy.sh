#!/usr/bin/env bash
set -euo pipefail

# Elixpo Packages build and Cloudflare Pages deployment helper.
# The trusted workflow owns stable release downloads, checksum verification,
# APT signing, artifact assembly, candidate testing, and optional promotion.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY="elixpo/packages.elixpo"
WORKFLOW="deploy-cloudflare-pages.yml"
BRANCH="main"
DRY_RUN=false
DO_BUILD=false
DO_DEPLOY=false
PROMOTE_DOMAIN=false

usage() {
  cat <<'EOF'
Usage: ./deploy.sh --pages PHASE... [options]

Phases:
  build             Validate and assemble the local package catalogue
  deploy            Dispatch the signed Cloudflare candidate workflow

Options:
  --promote-domain  Attach packages.elixpo.com after candidate smoke tests pass
  --ref NAME        Git ref to deploy (default: main)
  --dry-run         Print commands without executing them
  -h, --help        Show this help

Examples:
  ./deploy.sh --pages build
  ./deploy.sh --pages build deploy
  ./deploy.sh --pages deploy --promote-domain
EOF
}

run() {
  if "$DRY_RUN"; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

build_site() {
  echo '==> Validating Elixpo Packages registry and frontend...'
  run npm run registry:check
  run npm run lint
  run npm run typecheck
  run npm run build

  if "$DRY_RUN"; then
    run python3 scripts/prepare_site.py .deploy/site
    run python3 scripts/check_site.py .deploy/site
  else
    if [[ ! -f "$SCRIPT_DIR/out/index.html" ]]; then
      echo 'Error: static export out/index.html was not produced.' >&2
      exit 1
    fi
    rm -rf "$SCRIPT_DIR/.deploy/site"
    mkdir -p "$SCRIPT_DIR/.deploy"
    python3 scripts/prepare_site.py "$SCRIPT_DIR/.deploy/site"
    python3 scripts/check_site.py "$SCRIPT_DIR/.deploy/site"
  fi
  echo '==> Local package catalogue is ready in .deploy/site/.'
  echo '    Signed APT metadata and Debian artifacts are added by the trusted workflow.'
}

deploy_site() {
  if ! "$DRY_RUN" && [[ -n "$(git -C "$SCRIPT_DIR" status --porcelain)" ]]; then
    echo 'Error: commit and push repository changes before production deployment.' >&2
    exit 1
  fi
  echo "==> Dispatching $WORKFLOW from $BRANCH..."
  run gh workflow run "$WORKFLOW" \
    --repo "$REPOSITORY" \
    --ref "$BRANCH" \
    --raw-field "promote_domain=$PROMOTE_DOMAIN"
  echo '==> Deployment dispatched. Track it with:'
  echo "    gh run list --repo $REPOSITORY --workflow $WORKFLOW --limit 1"
}

[[ $# -gt 0 ]] || { usage; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pages) ;;
    build) DO_BUILD=true ;;
    deploy) DO_DEPLOY=true ;;
    --promote-domain) PROMOTE_DOMAIN=true ;;
    --ref)
      [[ $# -ge 2 ]] || { echo 'Error: --ref requires a value.' >&2; exit 1; }
      BRANCH="$2"
      shift
      ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help|help) usage; exit 0 ;;
    *) echo "Error: unknown argument: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

"$DO_BUILD" || "$DO_DEPLOY" || { echo 'Error: choose build, deploy, or both.' >&2; exit 1; }
cd "$SCRIPT_DIR"
"$DO_BUILD" && build_site
"$DO_DEPLOY" && deploy_site
