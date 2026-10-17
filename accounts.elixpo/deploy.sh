#!/usr/bin/env bash
# Usage:
#   ./deploy.sh --package build deploy      — publish to npm + GitHub Release
#   ./deploy.sh --package --vs build deploy — build and publish a VS Code extension
#   ./deploy.sh --worker build deploy       — build and deploy a Cloudflare Worker
#   ./deploy.sh --pages build deploy        — build and deploy Cloudflare Pages
#   ./deploy.sh --github build deploy       — build and mirror to GitHub Packages

set -euo pipefail

PROJECT="elixpo-accounts"
ENV_FILE="${DEPLOY_ENV_FILE:-.env.local}"
PACKAGE_DIR="${PACKAGE_DIR:-./packages/accounts}"
VSCODE_PACKAGE_DIR="${VSCODE_PACKAGE_DIR:-./packages/vscode}"
WORKER_CONFIG="${WORKER_CONFIG:-wrangler.worker.toml}"
TEMP_NPMRC=""
TEMP_RELEASE_DIR=""

usage() {
  sed -n '2,7p' "$0"
}

cleanup() {
  if [ -n "$TEMP_NPMRC" ] && [ -f "$TEMP_NPMRC" ]; then
    rm -f "$TEMP_NPMRC"
  fi
  if [ -n "$TEMP_RELEASE_DIR" ] && [ -d "$TEMP_RELEASE_DIR" ]; then
    rm -rf "$TEMP_RELEASE_DIR"
  fi
}

trap cleanup EXIT

is_skipped_runtime_key() {
  local key="$1"

  # Deployment credentials are local/CI inputs and must never become Pages
  # runtime secrets. The remaining values are vars declared in wrangler.toml.
  [[ "$key" == "NPM_TOKEN" || \
     "$key" == "GITHUB_TOKEN" || \
     "$key" == "VSCE_PAT" || \
     "$key" == "CLOUDFLARE_API_TOKEN" || \
     "$key" == "CLOUDFLARE_ACCOUNT_ID" || \
     "$key" == "NPM_CONFIG_PROVENANCE" || \
     "$key" == "ENVIRONMENT" || \
     "$key" == "JWT_EXPIRATION_MINUTES" || \
     "$key" == "REFRESH_TOKEN_EXPIRATION_DAYS" ]]
}

read_env_value() {
  local requested_key="$1"
  local line key value

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    key="${key#export }"
    [ "$key" != "$requested_key" ] && continue

    value="${line#*=}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    printf '%s' "$value"
    return 0
  done < "$ENV_FILE"

  return 1
}

validate_plaintext_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found"
    echo "Create it with: sops decrypt .env > .env.local"
    exit 1
  fi

  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    key="${key#export }"
    value="${line#*=}"

    if [[ "$value" == ENC\[* || "$value" == \"ENC\[* || "$key" == sops_* ]]; then
      echo "Error: $ENV_FILE contains SOPS-encrypted data ($key)."
      echo "Deployments must use plaintext values from .env.local or CI secrets."
      exit 1
    fi
  done < "$ENV_FILE"
}

resolve_secret() {
  local key="$1"
  local value="${!key:-}"

  if [ -n "$value" ]; then
    printf '%s' "$value"
    return 0
  fi

  validate_plaintext_env
  value="$(read_env_value "$key" || true)"
  if [ -z "$value" ]; then
    echo "Error: $key is missing from the environment and $ENV_FILE." >&2
    return 1
  fi
  printf '%s' "$value"
}

validate_pages_build_env() {
  if [ -f "$ENV_FILE" ]; then
    validate_plaintext_env
  elif [ "${GITHUB_ACTIONS:-false}" != "true" ]; then
    validate_plaintext_env
  fi
}

push_pages_secrets() {
  validate_plaintext_env

  echo "=== Pushing plaintext secrets to Cloudflare Pages ==="
  local count=0 line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    key="${key#export }"
    value="${line#*=}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    [[ "$key" == "NODE_ENV" ]] && value="production"
    is_skipped_runtime_key "$key" && continue

    echo "  Setting: $key"
    printf '%s' "$value" | npx wrangler pages secret put "$key" \
      --project-name "$PROJECT" 2>&1
    count=$((count + 1))
  done < "$ENV_FILE"
  echo "Pushed $count secrets."
}

build_pages() {
  validate_pages_build_env
  echo "=== Building Cloudflare Pages ==="
  npm run pages:build
}

deploy_pages() {
  if [ ! -d ".vercel/output/static" ]; then
    echo "Error: Pages output not found. Run './deploy.sh --pages build' first."
    exit 1
  fi

  local branch="${DEPLOY_BRANCH:-main}"
  echo "=== Deploying Cloudflare Pages on $branch ==="
  npx wrangler pages deploy ./.vercel/output/static \
    --project-name "$PROJECT" \
    --branch "$branch"
}

build_sdk() {
  echo "=== Building @elixpo/accounts ==="
  npm run sdk:build
}

configure_npm_auth() {
  local registry="$1"
  local registry_host="${registry#https://}"

  cleanup
  TEMP_NPMRC="$(mktemp)"
  chmod 600 "$TEMP_NPMRC"
  printf '%s\n' \
    "registry=$registry" \
    "//$registry_host:_authToken=\${NODE_AUTH_TOKEN}" > "$TEMP_NPMRC"
}

publish_sdk() {
  local destination="$1"
  local registry token_key provenance
  case "$destination" in
    npm)
      registry="https://registry.npmjs.org/"
      token_key="NPM_TOKEN"
      provenance="${GITHUB_ACTIONS:-false}"
      ;;
    github)
      registry="https://npm.pkg.github.com/"
      token_key="GITHUB_TOKEN"
      provenance="false"
      ;;
    *)
      echo "Error: unsupported package destination: $destination"
      exit 1
      ;;
  esac

  local token version tag
  token="$(resolve_secret "$token_key")"
  version="$(node -p "require('$PACKAGE_DIR/package.json').version")"
  tag="latest"
  [[ "$version" == *-* ]] && tag="beta"
  configure_npm_auth "$registry"

  if NODE_AUTH_TOKEN="$token" NPM_CONFIG_USERCONFIG="$TEMP_NPMRC" \
    npm view "@elixpo/accounts@$version" version --registry "$registry" >/dev/null 2>&1; then
    echo "@elixpo/accounts@$version already exists on $destination; skipping."
    return 0
  fi

  if [ "$destination" = "npm" ]; then
    NODE_AUTH_TOKEN="$token" NPM_CONFIG_USERCONFIG="$TEMP_NPMRC" \
      npm whoami --registry "$registry" >/dev/null
  fi

  echo "=== Publishing @elixpo/accounts@$version to $destination ==="
  NODE_AUTH_TOKEN="$token" \
    NPM_CONFIG_USERCONFIG="$TEMP_NPMRC" \
    NPM_CONFIG_PROVENANCE="$provenance" \
    npm publish "$PACKAGE_DIR" \
      --registry "$registry" \
      --access public \
      --tag "$tag" \
      --provenance="$provenance"
}

create_github_release() {
  local version release_tag target gh_token tarball_name tarball
  version="$(node -p "require('$PACKAGE_DIR/package.json').version")"
  release_tag="accounts-v$version"
  target="${GITHUB_SHA:-$(git rev-parse HEAD)}"
  gh_token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

  if [ -z "$gh_token" ] && [ -f "$ENV_FILE" ]; then
    validate_plaintext_env
    gh_token="$(read_env_value "GITHUB_TOKEN" || true)"
  fi

  if [ -n "$gh_token" ]; then
    export GH_TOKEN="$gh_token"
  fi

  if gh release view "$release_tag" >/dev/null 2>&1; then
    echo "GitHub Release $release_tag already exists; skipping."
    return 0
  fi

  TEMP_RELEASE_DIR="$(mktemp -d)"
  tarball_name="$(npm pack "$PACKAGE_DIR" --pack-destination "$TEMP_RELEASE_DIR" --silent)"
  tarball="$TEMP_RELEASE_DIR/$tarball_name"

  local release_args=(
    "$release_tag"
    "$tarball"
    --target "$target"
    --title "@elixpo/accounts v$version"
    --generate-notes
  )
  [[ "$version" == *-* ]] && release_args+=(--prerelease)

  echo "=== Creating GitHub Release $release_tag ==="
  gh release create "${release_args[@]}"
}

require_vscode_package() {
  if [ ! -f "$VSCODE_PACKAGE_DIR/package.json" ]; then
    echo "Error: no VS Code extension found at $VSCODE_PACKAGE_DIR."
    echo "Set VSCODE_PACKAGE_DIR after adding the extension package."
    exit 1
  fi
}

build_vscode() {
  require_vscode_package
  npm --prefix "$VSCODE_PACKAGE_DIR" run build
  (cd "$VSCODE_PACKAGE_DIR" && npx --no-install vsce package)
}

deploy_vscode() {
  require_vscode_package
  local vsce_pat
  vsce_pat="$(resolve_secret "VSCE_PAT")"
  (cd "$VSCODE_PACKAGE_DIR" && VSCE_PAT="$vsce_pat" npx --no-install vsce publish)
}

require_worker_config() {
  if [ ! -f "$WORKER_CONFIG" ]; then
    echo "Error: no standalone Worker config found at $WORKER_CONFIG."
    echo "Set WORKER_CONFIG after adding a Worker entrypoint and config."
    exit 1
  fi
}

build_worker() {
  require_worker_config
  npx --no-install wrangler deploy --config "$WORKER_CONFIG" --dry-run
}

deploy_worker() {
  require_worker_config
  npx --no-install wrangler deploy --config "$WORKER_CONFIG"
}

run_target() {
  local target="$1"
  shift

  if [ $# -eq 0 ]; then
    set -- build deploy
  fi

  local command
  for command in "$@"; do
    case "$target:$command" in
      npm:build|github:build) build_sdk ;;
      npm:deploy)
        publish_sdk npm
        create_github_release
        ;;
      github:deploy) publish_sdk github ;;
      vscode:build) build_vscode ;;
      vscode:deploy) deploy_vscode ;;
      worker:build) build_worker ;;
      worker:deploy) deploy_worker ;;
      pages:build) build_pages ;;
      pages:deploy) deploy_pages ;;
      pages:secrets) push_pages_secrets ;;
      pages:check-env) validate_plaintext_env ;;
      *)
        echo "Error: unsupported command '$command' for target '$target'."
        usage
        exit 1
        ;;
    esac
  done
}

if [ $# -eq 0 ]; then
  usage
  exit 1
fi

case "$1" in
  --package)
    shift
    if [ "${1:-}" = "--vs" ]; then
      shift
      run_target vscode "$@"
    else
      run_target npm "$@"
    fi
    ;;
  --worker)
    shift
    run_target worker "$@"
    ;;
  --pages)
    shift
    run_target pages "$@"
    ;;
  --github)
    shift
    run_target github "$@"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Error: choose an explicit deployment target."
    usage
    exit 1
    ;;
esac
