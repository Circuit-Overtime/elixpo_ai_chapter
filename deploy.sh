#!/usr/bin/env bash
set -euo pipefail

# One deployment contract for npm, VS Code, Workers, Pages, and GitHub Packages.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGES_DIR="$SCRIPT_DIR/packages"
PAGES_PROJECT="elixpourl"
PAGES_OUTDIR="$SCRIPT_DIR/.vercel/output/static"
PAGES_BRANCH="${DEPLOY_BRANCH:-main}"
WRANGLER_CONFIG="$SCRIPT_DIR/wrangler.toml"
SUBDOMAIN_CONFIG="$SCRIPT_DIR/wrangler.subdomains.toml"

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

DRY_RUN=false
BUMP=""
PACKAGE_SELECTOR=""
SELECT_VS=false

log() { echo -e "${GREEN}▸${RESET} $1"; }
dim() { echo -e "${DIM}  $1${RESET}"; }
err() { echo -e "${RED}✗${RESET} $1" >&2; }

usage() {
  echo -e "${BOLD}Usage:${RESET} ./deploy.sh TARGET [SELECTOR] PHASE... [options]"
  echo ""
  echo "Targets:"
  echo "  --package                 npm packages"
  echo "  --package --name <name>   one npm package"
  echo "  --package --<name>        shorthand for one npm package"
  echo "  --package --vs            VS Code packages"
  echo "  --worker                  Cloudflare Worker"
  echo "  --pages                   Cloudflare Pages"
  echo "  --github                  GitHub Packages mirror"
  echo ""
  echo "Phases:"
  echo "  build                     install, test, and package/build"
  echo "  deploy                    publish or deploy"
  echo ""
  echo "Options:"
  echo "  --no-bump                 keep manifest versions (default)"
  echo "  --patch|--minor|--major   bump selected package versions"
  echo "  --dry-run                 print commands without executing"
  echo ""
  echo "Examples:"
  echo "  ./deploy.sh --package build deploy"
  echo "  ./deploy.sh --package --name lixrl-cli build deploy"
  echo "  ./deploy.sh --package --lixrl-cli build deploy"
  echo "  ./deploy.sh --package --vs build deploy"
  echo "  ./deploy.sh --worker build deploy"
  echo "  ./deploy.sh --pages build deploy"
  echo "  ./deploy.sh --github build deploy"
  echo ""
  echo "Legacy commands remain available: build, deploy, all, migrate, secrets."
}

check_not_root() {
  if [ "$(id -u)" = "0" ]; then
    err "Refusing to run as root. Run as your normal user."
    exit 1
  fi
}

run_in_dir() {
  local directory="$1"
  shift
  if $DRY_RUN; then
    printf '[dry-run] cd %q &&' "$directory"
    printf ' %q' "$@"
    printf '\n'
  else
    (cd "$directory" && "$@")
  fi
}

package_name() {
  sed -n 's/^[[:space:]]*"name":[[:space:]]*"\([^"]*\)".*/\1/p' "$1/package.json" | head -1
}

package_version() {
  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$1/package.json" | head -1
}

is_vscode_package() {
  grep -Eq '"vscode"[[:space:]]*:' "$1/package.json"
}

selected_package_dirs() {
  local mode="$1" manifest directory basename package_name found=false
  for manifest in "$PACKAGES_DIR"/*/package.json; do
    [ -f "$manifest" ] || continue
    directory="$(dirname "$manifest")"
    basename="$(basename "$directory")"
    package_name="$(package_name "$directory")"

    if [ "$mode" = "vscode" ]; then
      is_vscode_package "$directory" || continue
    else
      if is_vscode_package "$directory"; then continue; fi
    fi
    if [ -n "$PACKAGE_SELECTOR" ] && \
       [ "$PACKAGE_SELECTOR" != "$basename" ] && \
       [ "$PACKAGE_SELECTOR" != "$package_name" ]; then
      continue
    fi
    printf '%s\n' "$directory"
    found=true
  done
  if ! $found; then
    err "No ${mode} package matched '${PACKAGE_SELECTOR:-all}'."
    return 1
  fi
}

bump_package() {
  local directory="$1"
  if [ -z "$BUMP" ]; then return 0; fi
  log "Bumping $(package_name "$directory") ($BUMP)..."
  run_in_dir "$directory" npm version "$BUMP" --no-git-tag-version
}

has_script() {
  grep -Eq "\"$2\"[[:space:]]*:" "$1/package.json"
}

build_npm_package() {
  local directory="$1" name
  name="$(package_name "$directory")"
  log "Building ${BOLD}$name${RESET}..."
  run_in_dir "$directory" npm ci
  if has_script "$directory" build; then run_in_dir "$directory" npm run build; fi
  if has_script "$directory" test; then run_in_dir "$directory" npm test; fi
  run_in_dir "$directory" npm pack --dry-run
}

publish_npm_package() {
  local directory="$1" name version
  name="$(package_name "$directory")"
  version="$(package_version "$directory")"
  log "Publishing ${BOLD}$name@$version${RESET} to npm..."
  if ! $DRY_RUN && npm view "$name@$version" version --registry https://registry.npmjs.org/ >/dev/null 2>&1; then
    err "$name@$version already exists on npm. Bump the package version before deploying."
    exit 1
  fi
  local arguments=(publish --access public --registry https://registry.npmjs.org/)
  if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then arguments+=(--provenance); fi
  run_in_dir "$directory" npm "${arguments[@]}"
}

publish_github_package() {
  local directory="$1" name version
  name="$(package_name "$directory")"
  version="$(package_version "$directory")"
  log "Mirroring ${BOLD}$name@$version${RESET} to GitHub Packages..."
  run_in_dir "$directory" npm publish --access public --registry https://npm.pkg.github.com/
}

build_vscode_package() {
  local directory="$1" name
  name="$(package_name "$directory")"
  log "Building VS Code package ${BOLD}$name${RESET}..."
  run_in_dir "$directory" npm ci
  if has_script "$directory" build; then run_in_dir "$directory" npm run build; fi
  if has_script "$directory" test; then run_in_dir "$directory" npm test; fi
  run_in_dir "$directory" npx @vscode/vsce package --no-dependencies
}

publish_vscode_package() {
  local directory="$1" name
  name="$(package_name "$directory")"
  if ! $DRY_RUN && [ -z "${VSCE_PAT:-}" ]; then
    err "VSCE_PAT is required to publish $name."
    exit 1
  fi
  log "Publishing ${BOLD}$name${RESET} to the VS Code Marketplace..."
  run_in_dir "$directory" npx @vscode/vsce publish --no-dependencies --pat "${VSCE_PAT:-dry-run}"
}

run_packages() {
  local registry="$1" action_build="$2" action_deploy="$3"
  local mode="npm" directory
  local -a directories=()
  if $SELECT_VS; then mode="vscode"; fi
  mapfile -t directories < <(selected_package_dirs "$mode")
  if [ ${#directories[@]} -eq 0 ]; then
    err "No ${mode} package matched '${PACKAGE_SELECTOR:-all}'."
    exit 1
  fi
  for directory in "${directories[@]}"; do
    bump_package "$directory"
    if [ "$mode" = "vscode" ]; then
      if $action_build; then build_vscode_package "$directory"; fi
      if $action_deploy; then publish_vscode_package "$directory"; fi
    else
      if $action_build; then build_npm_package "$directory"; fi
      if $action_deploy && [ "$registry" = "npm" ]; then publish_npm_package "$directory"; fi
      if $action_deploy && [ "$registry" = "github" ]; then publish_github_package "$directory"; fi
    fi
  done
}

load_cloudflare_auth() {
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [[ "$CLOUDFLARE_API_TOKEN" != ENC\[* ]]; then return; fi
  if ! command -v sops >/dev/null 2>&1; then
    err "sops is required to decrypt Cloudflare credentials from .env"
    exit 1
  fi
  local encrypted="$SCRIPT_DIR/.env"
  if [ ! -f "$encrypted" ]; then err ".env (sops-encrypted) not found"; exit 1; fi
  if [ -z "${SOPS_AGE_KEY:-}" ]; then
    local keyfile="$HOME/.config/sops/age/keys.txt"
    if [ ! -f "$keyfile" ]; then err "No AGE key. Set SOPS_AGE_KEY or create $keyfile"; exit 1; fi
    SOPS_AGE_KEY="$(grep 'AGE-SECRET-KEY' "$keyfile" | head -1)"
    export SOPS_AGE_KEY
  fi
  local decrypted token="" account_id=""
  decrypted="$(sops decrypt "$encrypted")"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      CLOUDFLARE_API_TOKEN=*) token="${line#*=}" ;;
      CLOUDFLARE_ACCOUNT_ID=*) account_id="${line#*=}" ;;
    esac
  done <<< "$decrypted"
  if [ -z "$token" ]; then err "CLOUDFLARE_API_TOKEN not found in decrypted .env"; exit 1; fi
  export CLOUDFLARE_API_TOKEN="$token"
  if [ -n "$account_id" ]; then export CLOUDFLARE_ACCOUNT_ID="$account_id"; fi
}

pages_build() {
  log "Building ${BOLD}$PAGES_PROJECT${RESET} for Cloudflare Pages..."
  run_in_dir "$SCRIPT_DIR" npm run pages:build
}

pages_deploy() {
  if ! $DRY_RUN && [ ! -d "$PAGES_OUTDIR" ]; then
    err "Pages output is missing. Run './deploy.sh --pages build deploy'."
    exit 1
  fi
  if ! $DRY_RUN; then load_cloudflare_auth; fi
  log "Deploying Pages project ${BOLD}$PAGES_PROJECT${RESET} on ${BOLD}$PAGES_BRANCH${RESET}..."
  # Working at the repository root makes Wrangler load wrangler.toml.
  run_in_dir "$SCRIPT_DIR" npx wrangler pages deploy .vercel/output/static \
    --project-name "$PAGES_PROJECT" --branch "$PAGES_BRANCH"
}

worker_build() {
  log "Building the ${BOLD}*.lixrl.com${RESET} Worker with wrangler.subdomains.toml..."
  run_in_dir "$SCRIPT_DIR" npx wrangler deploy --config "$SUBDOMAIN_CONFIG" \
    --dry-run --outdir .wrangler/deploy/subdomains
}

worker_deploy() {
  if ! $DRY_RUN; then load_cloudflare_auth; fi
  log "Deploying the ${BOLD}*.lixrl.com${RESET} Worker..."
  run_in_dir "$SCRIPT_DIR" npx wrangler deploy --config "$SUBDOMAIN_CONFIG"
}

do_migrate() {
  if ! $DRY_RUN; then load_cloudflare_auth; fi
  log "Applying remote D1 migrations with wrangler.toml..."
  run_in_dir "$SCRIPT_DIR" npx wrangler d1 migrations apply "$PAGES_PROJECT" \
    --config "$WRANGLER_CONFIG" --remote
}

do_secrets() {
  if ! command -v sops >/dev/null 2>&1; then err "sops is required for secrets"; exit 1; fi
  local encrypted="$SCRIPT_DIR/.env"
  if [ ! -f "$encrypted" ]; then err ".env (sops-encrypted) not found"; exit 1; fi
  load_cloudflare_auth
  local decrypted key count=0
  decrypted="$(sops decrypt "$encrypted")"
  declare -A vars=()
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    vars["$key"]="${line#*=}"
  done <<< "$decrypted"
  for key in "${!vars[@]}"; do
    case "$key" in CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|DEV_TIER_OVERRIDE|BASE_URL) continue ;; esac
    printf '%s' "${vars[$key]}" | npx wrangler pages secret put "$key" \
      --config "$WRANGLER_CONFIG" --project-name "$PAGES_PROJECT" >/dev/null
    count=$((count + 1))
  done
  log "Uploaded $count Pages secrets."
}

run_target_standard() {
  local target="" action_build=false action_deploy=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --package|--worker|--pages|--github)
        if [ -n "$target" ]; then err "Choose exactly one target."; exit 1; fi
        target="${1#--}"
        ;;
      --name)
        shift
        if [ $# -eq 0 ]; then err "--name requires a package name."; exit 1; fi
        PACKAGE_SELECTOR="$1"
        ;;
      --name=*) PACKAGE_SELECTOR="${1#*=}" ;;
      --vs) SELECT_VS=true ;;
      --patch) BUMP="patch" ;;
      --minor) BUMP="minor" ;;
      --major) BUMP="major" ;;
      --no-bump) BUMP="" ;;
      --dry-run) DRY_RUN=true ;;
      build) action_build=true ;;
      deploy) action_deploy=true ;;
      -h|--help|help) usage; return ;;
      --*)
        if [ "$target" = "package" ] || [ "$target" = "github" ]; then
          PACKAGE_SELECTOR="${1#--}"
        else
          err "Unknown option: $1"; exit 1
        fi
        ;;
      *) err "Unknown argument: $1"; usage; exit 1 ;;
    esac
    shift
  done
  if [ -z "$target" ] || { ! $action_build && ! $action_deploy; }; then
    err "Choose one target and at least one build or deploy phase."
    usage
    exit 1
  fi
  if $SELECT_VS && [ "$target" != "package" ]; then err "--vs requires --package."; exit 1; fi

  case "$target" in
    package) run_packages npm "$action_build" "$action_deploy" ;;
    github) run_packages github "$action_build" "$action_deploy" ;;
    worker)
      if $action_build; then worker_build; fi
      if $action_deploy; then worker_deploy; fi
      ;;
    pages)
      if $action_build; then pages_build; fi
      if $action_deploy; then pages_deploy; fi
      ;;
  esac
}

run_legacy_command() {
  case "$1" in
    build) pages_build ;;
    deploy)
      if [ ! -d "$PAGES_OUTDIR" ]; then pages_build; fi
      pages_deploy
      if [ "$PAGES_BRANCH" = "main" ]; then worker_deploy; fi
      ;;
    all) pages_build; pages_deploy; if [ "$PAGES_BRANCH" = "main" ]; then worker_deploy; fi ;;
    migrate) do_migrate ;;
    secrets) do_secrets ;;
    -h|--help|help) usage ;;
    *) err "Unknown command: $1"; usage; exit 1 ;;
  esac
}

check_not_root
if [ $# -eq 0 ]; then usage; exit 1; fi

if [[ "$1" =~ ^--(package|worker|pages|github)$ ]]; then
  run_target_standard "$@"
else
  for command in "$@"; do run_legacy_command "$command"; done
fi
