#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$ROOT_DIR/crumb.elixpo"
WRANGLER_CONFIG="$SITE_DIR/wrangler.toml"
WORKER_NAME="crumb-elixpo"
D1_DATABASE="crumb-elixpo"
KV_TITLE="crumb-elixpo-KV"
DRY_RUN=false
TARGET=""
PACKAGE_NAME=""
VSCODE_PACKAGE=false
QUICK_BUILD=false
PAGES_DIR="${CRUMB_PAGES_DIR:-$SITE_DIR}"
PAGES_PROJECT="${CRUMB_PAGES_PROJECT:-crumb-elixpo}"
PAGES_OUTPUT_DIR="${CRUMB_PAGES_OUTPUT_DIR:-dist}"
declare -a ACTIONS=()
declare -a PACKAGE_DIRS=()

log() { printf '\033[32m▸\033[0m %s\n' "$1"; }
fail() { printf '\033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage: ./deploy.sh TARGET [OPTIONS] ACTION...

Targets:
  --package              Publish all public npm packages
  --package --name NAME  Publish one npm package by name or directory
  --package --vs         Build or publish the VS Code extension
  --worker               Build or deploy the OpenNext Cloudflare Worker
  --pages                Build or deploy a Cloudflare Pages application
  --github               Mirror public npm packages to GitHub Packages
  --terminal             Build the standalone Crumb terminal binary

Actions:
  build                  Install dependencies and build the selected target
  deploy                 Publish or deploy the selected target

Worker-only actions:
  provision              Create D1 and KV resources when absent
  migrate                Apply remote D1 migrations
  secrets                Upload secrets from the encrypted root .env

Options:
  --name NAME            Select one npm package
  --vs                   Select the VS Code package
  --quick                Use the fast debug profile for terminal builds
  --dry-run              Print commands without executing them
  -h, --help             Show this help

Examples:
  ./deploy.sh --package build deploy
  ./deploy.sh --package --name @crumb/sdk build deploy
  ./deploy.sh --package --vs build deploy
  ./deploy.sh --worker build deploy
  ./deploy.sh --pages build deploy
  ./deploy.sh --github build deploy
  ./deploy.sh --terminal build
  ./deploy.sh --terminal --quick build
USAGE
}

run() {
  if $DRY_RUN; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

run_site() {
  if $DRY_RUN; then
    printf '[dry-run] cd %q &&' "$SITE_DIR"
    printf ' %q' "$@"
    printf '\n'
  else
    (cd "$SITE_DIR" && "$@")
  fi
}

require_tools() {
  if $DRY_RUN; then
    [ -f "$WRANGLER_CONFIG" ] || fail "Missing $WRANGLER_CONFIG"
    return
  fi
  command -v node >/dev/null 2>&1 || fail "Node.js is required."
  command -v npm >/dev/null 2>&1 || fail "npm is required."
  [ -f "$WRANGLER_CONFIG" ] || fail "Missing $WRANGLER_CONFIG"
}

load_cloudflare_auth() {
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [[ "${CLOUDFLARE_API_TOKEN}" != ENC\[* ]]; then
    return
  fi
  command -v sops >/dev/null 2>&1 || fail "sops is required to decrypt the root .env."
  [ -f "$ROOT_DIR/.env" ] || fail "Missing SOPS-encrypted root .env."
  local decrypted token="" account_id=""
  decrypted="$(sops decrypt "$ROOT_DIR/.env")"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      CLOUDFLARE_API_TOKEN=*) token="${line#*=}" ;;
      CLOUDFLARE_ACCOUNT_ID=*) account_id="${line#*=}" ;;
    esac
  done <<< "$decrypted"
  [ -n "$token" ] || fail "CLOUDFLARE_API_TOKEN is missing from the decrypted .env."
  export CLOUDFLARE_API_TOKEN="$token"
  if [ -n "$account_id" ]; then export CLOUDFLARE_ACCOUNT_ID="$account_id"; fi
}

json_match() {
  local field="$1" value="$2" result="$3"
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input);
      const rows = Array.isArray(parsed) ? parsed : parsed.result || [];
      const row = rows.find(item => item[process.argv[1]] === process.argv[2]);
      if (row?.[process.argv[3]]) process.stdout.write(String(row[process.argv[3]]));
    });
  ' "$field" "$value" "$result"
}

d1_id() {
  run_site npx wrangler d1 list --json --config "$WRANGLER_CONFIG" | json_match name "$D1_DATABASE" uuid
}

kv_id() {
  run_site npx wrangler kv namespace list --config "$WRANGLER_CONFIG" | json_match title "$KV_TITLE" id
}

replace_resource_ids() {
  local database_id="$1" namespace_id="$2"
  DATABASE_ID="$database_id" NAMESPACE_ID="$namespace_id" CONFIG_PATH="$WRANGLER_CONFIG" node -e '
    const fs = require("node:fs");
    const path = process.env.CONFIG_PATH;
    let value = fs.readFileSync(path, "utf8");
    value = value.replace(/database_id = "[^"]+"/, `database_id = "${process.env.DATABASE_ID}"`);
    value = value.replace(
      /(\[\[kv_namespaces\]\]\s*binding = "KV"\s*)id = "[^"]+"/,
      `$1id = "${process.env.NAMESPACE_ID}"`,
    );
    fs.writeFileSync(path, value);
  '
}

provision() {
  require_tools
  if $DRY_RUN; then
    run_site npx wrangler d1 create "$D1_DATABASE" --location apac
    run_site npx wrangler kv namespace create "$KV_TITLE" --config "$WRANGLER_CONFIG"
    return
  fi
  load_cloudflare_auth

  local database_id namespace_id
  database_id="$(d1_id)"
  if [ -z "$database_id" ]; then
    log "Creating D1 database $D1_DATABASE..."
    run_site npx wrangler d1 create "$D1_DATABASE" --location apac
    database_id="$(d1_id)"
  fi
  [ -n "$database_id" ] || fail "Could not resolve the D1 database ID."

  namespace_id="$(kv_id)"
  if [ -z "$namespace_id" ]; then
    log "Creating KV namespace $KV_TITLE..."
    run_site npx wrangler kv namespace create "$KV_TITLE" --config "$WRANGLER_CONFIG"
    namespace_id="$(kv_id)"
  fi
  [ -n "$namespace_id" ] || fail "Could not resolve the KV namespace ID."

  replace_resource_ids "$database_id" "$namespace_id"
  log "Cloudflare resources are ready and wrangler.toml is bound."
}

upload_secrets() {
  require_tools
  local -a keys=(
    NEXT_PUBLIC_ELIXPO_CLIENT_ID
    NEXT_PUBLIC_ELIXPO_CLIENT_ID_CLI
    ELIXPO_CLIENT_SECRET
    ELIXPO_ACCOUNTS_WEBHOOK_SECRET
    POLLINATIONS_APP_KEY
    CONNECTOR_ENCRYPTION_KEY
  )
  if $DRY_RUN; then
    printf '[dry-run] upload %d secrets with one wrangler secret bulk request to %q\n' \
      "${#keys[@]}" "$WORKER_NAME"
    return
  fi
  load_cloudflare_auth
  local decrypted local_values="" key value
  local -A values=()
  decrypted="$(sops decrypt "$ROOT_DIR/.env")"
  if [ -f "$ROOT_DIR/.env.local" ]; then
    local_values="$(<"$ROOT_DIR/.env.local")"
  elif [ -f "$SITE_DIR/.env.local" ]; then
    local_values="$(<"$SITE_DIR/.env.local")"
  fi
  for key in "${keys[@]}"; do
    value=""
    while IFS= read -r line || [ -n "$line" ]; do
      if [[ "$line" == "$key="* ]]; then value="${line#*=}"; break; fi
    done <<< "$local_values"
    while IFS= read -r line || [ -n "$line" ]; do
      if [ -z "$value" ] && [[ "$line" == "$key="* ]]; then value="${line#*=}"; break; fi
    done <<< "$decrypted"
    [ -n "$value" ] || fail "$key is missing from local or encrypted environment configuration."
    values["$key"]="$value"
  done

  log "Uploading ${#keys[@]} application secrets in one request..."
  {
    for key in "${keys[@]}"; do
      printf '%s\0%s\0' "$key" "${values[$key]}"
    done
  } | node -e '
    const chunks = [];
    process.stdin.on("data", chunk => chunks.push(chunk));
    process.stdin.on("end", () => {
      const parts = Buffer.concat(chunks).toString("utf8").split("\0");
      const secrets = {};
      for (let index = 0; index + 1 < parts.length; index += 2) {
        secrets[parts[index]] = parts[index + 1];
      }
      process.stdout.write(JSON.stringify(secrets));
    });
  ' | run_site npx wrangler secret bulk --name "$WORKER_NAME" --config "$WRANGLER_CONFIG"
  log "Application secrets uploaded."
}

migrate() {
  require_tools
  if ! $DRY_RUN; then load_cloudflare_auth; fi
  run_site npx wrangler d1 migrations apply "$D1_DATABASE" \
    --remote --config "$WRANGLER_CONFIG"
}

install_node_dependencies() {
  local directory="$1"
  if [ -f "$directory/package-lock.json" ]; then
    run_in "$directory" npm ci
  else
    run_in "$directory" npm install
  fi
}

run_in() {
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

build_worker() {
  require_tools
  install_node_dependencies "$SITE_DIR"
  run_site npm run cloudflare:build
}

deploy_worker() {
  require_tools
  if ! $DRY_RUN; then load_cloudflare_auth; fi
  run_site npm run cloudflare:deploy
}

package_field() {
  local manifest="$1" field="$2"
  node -e '
    const manifest = require(process.argv[1]);
    const value = manifest[process.argv[2]];
    if (value !== undefined) process.stdout.write(String(value));
  ' "$manifest" "$field"
}

discover_packages() {
  local manifest directory name private has_vscode
  while IFS= read -r manifest; do
    directory="$(dirname "$manifest")"
    [ "$directory" != "$SITE_DIR" ] || continue
    name="$(package_field "$manifest" name)"
    private="$(package_field "$manifest" private)"
    has_vscode="$(node -e '
      const manifest = require(process.argv[1]);
      process.stdout.write(String(Boolean(manifest.engines?.vscode)));
    ' "$manifest")"

    if $VSCODE_PACKAGE; then
      [ "$has_vscode" = true ] || continue
    else
      [ "$private" != true ] || continue
    fi
    if [ -n "$PACKAGE_NAME" ] \
      && [ "$PACKAGE_NAME" != "$name" ] \
      && [ "$PACKAGE_NAME" != "$(basename "$directory")" ]; then
      continue
    fi
    PACKAGE_DIRS+=("$directory")
  done < <(
    git -C "$ROOT_DIR" ls-files --cached --others --exclude-standard \
      -- 'package.json' '*/package.json' | sed "s#^#$ROOT_DIR/#" | sort
  )

  [ "${#PACKAGE_DIRS[@]}" -gt 0 ] || {
    if $VSCODE_PACKAGE; then
      fail "No VS Code extension package was found (a manifest with engines.vscode is required)."
    fi
    if [ -n "$PACKAGE_NAME" ]; then
      fail "No public npm package matches '$PACKAGE_NAME'."
    fi
    fail "No public npm packages were found."
  }
  if $VSCODE_PACKAGE && [ "${#PACKAGE_DIRS[@]}" -ne 1 ]; then
    fail "Multiple VS Code packages were found; keep one extension package per repository."
  fi
}

build_npm_packages() {
  local directory
  for directory in "${PACKAGE_DIRS[@]}"; do
    log "Building $(package_field "$directory/package.json" name)..."
    install_node_dependencies "$directory"
    run_in "$directory" npm run build --if-present
  done
}

deploy_npm_packages() {
  local registry="$1" directory
  for directory in "${PACKAGE_DIRS[@]}"; do
    local name
    name="$(package_field "$directory/package.json" name)"
    if [ "$registry" = "https://npm.pkg.github.com" ] && [[ "$name" != @*/* ]]; then
      fail "GitHub Packages requires a scoped npm name; '$name' is not scoped."
    fi
    log "Publishing $name to $registry..."
    run_in "$directory" npm publish --access public --registry "$registry"
  done
}

build_vscode_package() {
  local directory="${PACKAGE_DIRS[0]}"
  install_node_dependencies "$directory"
  if node -e 'process.exit(require(process.argv[1]).scripts?.package ? 0 : 1)' \
    "$directory/package.json"; then
    run_in "$directory" npm run package
  else
    run_in "$directory" npx vsce package
  fi
}

deploy_vscode_package() {
  [ -n "${VSCE_PAT:-}" ] || $DRY_RUN || fail "VSCE_PAT is required to publish a VS Code extension."
  run_in "${PACKAGE_DIRS[0]}" npx vsce publish
}

build_package_target() {
  if $VSCODE_PACKAGE; then
    build_vscode_package
  else
    build_npm_packages
  fi
}

deploy_package_target() {
  if $VSCODE_PACKAGE; then
    deploy_vscode_package
  else
    deploy_npm_packages "https://registry.npmjs.org"
  fi
}

require_pages() {
  [ -f "$PAGES_DIR/package.json" ] || fail "Missing Cloudflare Pages package at $PAGES_DIR/package.json."
  grep -q '"pages:build"' "$PAGES_DIR/package.json" || fail \
    "$(basename "$PAGES_DIR") is not a static Pages app; use './deploy.sh --worker build deploy'."
  $DRY_RUN && return
  command -v npm >/dev/null 2>&1 || fail "npm is required."
}

build_pages() {
  require_pages
  install_node_dependencies "$PAGES_DIR"
  run_in "$PAGES_DIR" npm run pages:build
}

deploy_pages() {
  require_pages
  if ! $DRY_RUN; then load_cloudflare_auth; fi
  [ -d "$PAGES_DIR/$PAGES_OUTPUT_DIR" ] || $DRY_RUN \
    || fail "Missing Pages output directory: $PAGES_DIR/$PAGES_OUTPUT_DIR"
  run_in "$PAGES_DIR" npx wrangler pages deploy "$PAGES_OUTPUT_DIR" \
    --project-name "$PAGES_PROJECT"
}

build_terminal() {
  if ! $DRY_RUN; then
    command -v cargo >/dev/null 2>&1 || fail "Rust and Cargo are required."
  fi
  if $QUICK_BUILD; then
    log "Quick-building the Crumb terminal binary..."
    run_in "$ROOT_DIR" cargo build --locked -p crumb-cli
    log "Terminal binary ready at $ROOT_DIR/target/debug/crumb"
  else
    log "Building the standalone Crumb terminal binary..."
    run_in "$ROOT_DIR" cargo build --locked --release -p crumb-cli
    log "Terminal binary ready at $ROOT_DIR/target/release/crumb"
  fi
}

set_target() {
  local selected="$1"
  [ -z "$TARGET" ] || [ "$TARGET" = "$selected" ] \
    || fail "Choose exactly one deployment target."
  TARGET="$selected"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --package) set_target package ;;
    --worker) set_target worker ;;
    --pages) set_target pages ;;
    --github) set_target github ;;
    --terminal) set_target terminal ;;
    --name)
      shift
      [ -n "${1:-}" ] || fail "--name requires a package name."
      PACKAGE_NAME="$1"
      ;;
    --vs) VSCODE_PACKAGE=true ;;
    --quick) QUICK_BUILD=true ;;
    --dry-run) DRY_RUN=true ;;
    build|deploy|provision|migrate|secrets) ACTIONS+=("$1") ;;
    -h|--help|help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
  shift
done

[ -n "$TARGET" ] || { usage; fail "A deployment target is required."; }
[ "${#ACTIONS[@]}" -gt 0 ] || fail "At least one action is required."
[ -z "$PACKAGE_NAME" ] || [ "$TARGET" = package ] || [ "$TARGET" = github ] \
  || fail "--name is only valid with --package or --github."
if $VSCODE_PACKAGE; then
  [ "$TARGET" = package ] || fail "--vs is only valid with --package."
  [ -z "$PACKAGE_NAME" ] || fail "--vs and --name cannot be combined."
fi
if $QUICK_BUILD; then
  [ "$TARGET" = terminal ] || fail "--quick is only valid with --terminal."
fi

for action in "${ACTIONS[@]}"; do
  case "$TARGET:$action" in
    worker:build|worker:deploy|worker:provision|worker:migrate|worker:secrets) ;;
    package:build|package:deploy|github:build|github:deploy|pages:build|pages:deploy|terminal:build) ;;
    *) fail "Action '$action' is not valid for --$TARGET." ;;
  esac
done

if [ "$TARGET" = package ] || [ "$TARGET" = github ]; then
  command -v node >/dev/null 2>&1 || fail "Node.js is required."
  command -v npm >/dev/null 2>&1 || fail "npm is required."
  discover_packages
fi

for action in "${ACTIONS[@]}"; do
  case "$TARGET:$action" in
    worker:build) build_worker ;;
    worker:deploy) deploy_worker ;;
    worker:provision) provision ;;
    worker:migrate) migrate ;;
    worker:secrets) upload_secrets ;;
    package:build) build_package_target ;;
    package:deploy) deploy_package_target ;;
    github:build) build_npm_packages ;;
    github:deploy) deploy_npm_packages "https://npm.pkg.github.com" ;;
    pages:build) build_pages ;;
    pages:deploy) deploy_pages ;;
    terminal:build) build_terminal ;;
    *) fail "Action '$action' is not valid for --$TARGET." ;;
  esac
done
