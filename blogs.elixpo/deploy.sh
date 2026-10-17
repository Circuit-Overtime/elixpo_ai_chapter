#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LixBlogs Deploy & Release
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Usage: ./deploy.sh TARGET [SELECTOR] PHASE... [options]
#
# Targets:
#   --package           npm packages (lixeditor + CLI by default)
#   --package --vs      VS Code extension
#   --worker            Cloudflare Workers
#   --pages             Cloudflare Pages
#   --github            GitHub Packages mirror
#
# Package selectors:
#   --lixeditor         Only @elixpo/lixeditor
#   --cli               Only @elixpo/lixblogs-cli
#
# Phases:
#   build               Build/package the target
#   deploy              Publish/deploy the target
#
# Options:
#   --patch     Patch version bump (default)
#   --minor     Minor version bump
#   --major     Major version bump
#   --no-bump   Publish the version already present in package.json
#   --dry-run   Print what would happen, don't execute
#
# Auth tokens are read automatically from .env:
#   NPM_TOKEN            → npm publish
#   GITHUB_ACCESS_TOKEN  → GitHub Packages
#   VSCE_PAT             → VS Code Marketplace
#
# Examples:
#   ./deploy.sh --package build deploy
#   ./deploy.sh --package --lixeditor build deploy
#   ./deploy.sh --package --cli build deploy
#   ./deploy.sh --package --vs build deploy
#   ./deploy.sh --worker build deploy
#   ./deploy.sh --pages build deploy
#   ./deploy.sh --github build deploy

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
PAGES_PROJECT="lixblogs"
PAGES_BRANCH="main"
RELEASE_ARTIFACT_ROOT="$SCRIPT_DIR/.release/packages"

# ── Helpers ──────────────────────────────────────────────────

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env not found at $ENV_FILE"
    exit 1
  fi
  # The committed .env is SOPS-encrypted — decrypt before exporting, else every
  # value comes through as ENC[...] and API calls fail.
  local _env_content
  if grep -q 'ENC\[' "$ENV_FILE" 2>/dev/null || grep -q '^sops' "$ENV_FILE" 2>/dev/null; then
    if [ -z "${SOPS_AGE_KEY:-}" ]; then
      for _age_key in "$HOME/.config/sops/age/keys.txt" "$HOME/.sops/elixpo-age-key.txt"; do
        if [ -f "$_age_key" ]; then
          export SOPS_AGE_KEY="$(grep 'AGE-SECRET-KEY' "$_age_key" | head -1)"
          break
        fi
      done
    fi
    _env_content="$(sops -d "$ENV_FILE")" || { echo "Error: failed to decrypt $ENV_FILE (set SOPS_AGE_KEY or create ~/.config/sops/age/keys.txt)"; exit 1; }
  else
    _env_content="$(cat "$ENV_FILE")"
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    # SOPS structural metadata rows (e.g. `sops_age__list_0__map_enc=
    # -----BEGIN AGE ENCRYPTED FILE-----`) carry unquoted whitespace
    # that `export` can't parse — they'd silently fall through the
    # `2>/dev/null` below, but skipping explicitly is cleaner.
    [[ "$line" =~ ^sops_ ]] && continue
    export "$line" 2>/dev/null || true
  done <<< "$_env_content"
}

get_binding_ids() {
  load_env
  D1_DB_ID="${D1_DATABASE_ID:?D1_DATABASE_ID not set in .env}"
  KV_ID="${KV_NAMESPACE_ID:?KV_NAMESPACE_ID not set in .env}"
}

dry_run() {
  if $DRY_RUN; then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

auth_remote() {
  local url
  url=$(git remote get-url origin)
  echo "${url/https:\/\//https:\/\/${GITHUB_ACCESS_TOKEN}@}"
}

# ── Infra Commands ───────────────────────────────────────────

secrets() {
  echo "==> Uploading secrets from .env..."
  load_env

  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# || "$key" =~ ^NEXT_PUBLIC_ ]] && continue
    [[ "$key" =~ ^(CLOUDFLARE_ACCOUNT|D1_DATABASE_ID|KV_NAMESPACE_ID)$ ]] && continue

    echo "  -> $key (collab worker)"
    printf '%s\n' "$value" |  npx wrangler versions secret put "$key" --name elixpoblogs-collab || echo "    [warn] collab worker secret failed for $key"
    echo "  -> $key (pages)"
    printf '%s\n' "$value" |  npx wrangler pages secret put "$key" --project-name "$PAGES_PROJECT" || echo "    [warn] pages secret failed for $key"

    # Only push to cron worker if it's enabled
    if grep -q 'ENABLE_WEEKLY_DIGEST=true' "$ENV_FILE" 2>/dev/null; then
      echo "  -> $key (cron worker)"
      printf '%s\n' "$value" |  npx wrangler versions secret put "$key" --name elixpoblogs-cron || echo "    [warn] cron worker secret failed for $key"
    fi
  done < "$ENV_FILE"

  echo "==> Secrets uploaded to Workers + Pages."
}

build() {
  echo "==> Building for Cloudflare Pages..."
   npm version patch --no-git-tag-version
   npm run pages:build
  echo "==> Build complete (.vercel/output/static)"
}

sync_d1() {
  echo "==> Syncing local D1 to remote..."
  LOCAL_DB="$SCRIPT_DIR/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
  DB_FILE=$(find "$LOCAL_DB" -name "*.sqlite" 2>/dev/null | head -1)

  if [ -z "$DB_FILE" ]; then
    echo "  [skip] No local D1 database found"
    return
  fi

  # Get all user-created tables (exclude internal ones)
  TABLES=$(sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations' ORDER BY name;")

  if [ -z "$TABLES" ]; then
    echo "  [skip] No tables to sync"
    return
  fi

  DUMP_FILE="/tmp/d1_sync_$(date +%s).sql"
  > "$DUMP_FILE"

  for tbl in $TABLES; do
    COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $tbl;")
    [ "$COUNT" -eq 0 ] && continue

    COLS=$(sqlite3 "$DB_FILE" "PRAGMA table_info($tbl);" | cut -d'|' -f2 | paste -sd,)
    sqlite3 "$DB_FILE" -separator '|' "SELECT * FROM $tbl;" | while IFS= read -r row; do
      VALS=$(echo "$row" | awk -F'|' '{
        for(i=1;i<=NF;i++) {
          gsub(/\047/, "\047\047", $i)
          if(i>1) printf ","
          if($i=="") printf "NULL"
          else printf "\047%s\047", $i
        }
      }')
      echo "INSERT OR REPLACE INTO $tbl ($COLS) VALUES ($VALS);" >> "$DUMP_FILE"
    done
    echo "  -> $tbl ($COUNT rows)"
  done

  LINES=$(wc -l < "$DUMP_FILE")
  if [ "$LINES" -eq 0 ]; then
    echo "  [skip] No data to sync"
    rm -f "$DUMP_FILE"
    return
  fi

   npx wrangler d1 execute elixpoblogs --remote --file="$DUMP_FILE" 2>&1 | tail -3
  rm -f "$DUMP_FILE"
  echo "==> D1 sync complete."
}

deploy() {
  if [ ! -d "$SCRIPT_DIR/.vercel/output/static" ]; then
    echo "==> No build found, building first..."
    build
  fi

  echo "==> Deploying to Cloudflare Pages ($PAGES_PROJECT)..."
   npx wrangler pages deploy .vercel/output/static \
    --project-name "$PAGES_PROJECT" \
    --branch "$PAGES_BRANCH"

  echo "==> Pages deploy complete."

  # Sync local D1 to remote
  sync_d1

  VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
   git add -A
  if  git diff --cached --quiet; then
    echo "==> No changes to commit."
  else
     git commit -m "deploy: v${VERSION}"
    load_env
     git push "$(auth_remote)" main
    echo "==> Pushed v${VERSION} to origin/main."
  fi
}

worker() {
  echo "==> Deploying Worker (elixpoblogs-collab)..."
  cd "$SCRIPT_DIR/worker/collab" &&  npx wrangler deploy
  cd "$SCRIPT_DIR"
  echo "==> Collab worker deployed."

  # Cron worker — only deploy if digest is enabled
  if grep -q 'ENABLE_WEEKLY_DIGEST=true' "$ENV_FILE" 2>/dev/null; then
    echo "==> Deploying Worker (elixpoblogs-cron)..."
    cd "$SCRIPT_DIR/worker/cron" &&  npx wrangler deploy
    cd "$SCRIPT_DIR"
    echo "==> Cron worker deployed."
  else
    echo "==> Skipping cron worker (ENABLE_WEEKLY_DIGEST is not true)"
  fi
}

# ── Target-based deployment standard ────────────────────────

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

pages_build() {
  echo "==> Building Cloudflare Pages..."
  run_in_dir "$SCRIPT_DIR" npm run pages:build
  echo "==> Pages build complete."
}

pages_deploy() {
  if ! $DRY_RUN && [ ! -d "$SCRIPT_DIR/.vercel/output/static" ]; then
    echo "Error: Pages output is missing. Run './deploy.sh --pages build deploy'."
    exit 1
  fi
  echo "==> Deploying Cloudflare Pages ($PAGES_PROJECT)..."
  run_in_dir "$SCRIPT_DIR" npx wrangler pages deploy .vercel/output/static \
    --project-name "$PAGES_PROJECT" --branch "$PAGES_BRANCH"
  echo "==> Pages deploy complete."
}

worker_build() {
  echo "==> Building collab Worker bundle..."
  run_in_dir "$SCRIPT_DIR" npx wrangler deploy --config worker/collab/wrangler.toml \
    --dry-run --outdir .wrangler/deploy/collab

  if grep -q 'ENABLE_WEEKLY_DIGEST=true' "$ENV_FILE" 2>/dev/null; then
    echo "==> Building cron Worker bundle..."
    run_in_dir "$SCRIPT_DIR" npx wrangler deploy --config worker/cron/wrangler.toml \
      --dry-run --outdir .wrangler/deploy/cron
  fi
}

worker_deploy() {
  echo "==> Deploying collab Worker..."
  run_in_dir "$SCRIPT_DIR" npx wrangler deploy --config worker/collab/wrangler.toml

  if grep -q 'ENABLE_WEEKLY_DIGEST=true' "$ENV_FILE" 2>/dev/null; then
    echo "==> Deploying cron Worker..."
    run_in_dir "$SCRIPT_DIR" npx wrangler deploy --config worker/cron/wrangler.toml
  fi
  echo "==> Worker deploy complete."
}

selected_package_dirs() {
  $SELECT_LIXEDITOR && printf '%s\n' "$SCRIPT_DIR/packages/lixeditor"
  $SELECT_CLI && printf '%s\n' "$SCRIPT_DIR/packages/lixblogs-cli"
}

bump_selected_packages() {
  $NO_BUMP && {
    echo "==> Keeping package versions (--no-bump)."
    return
  }

  local directory
  while IFS= read -r directory; do
    [ -n "$directory" ] || continue
    local package_name current_version remote_version should_bump
    package_name=$(node -p "require('$directory/package.json').name")
    current_version=$(node -p "require('$directory/package.json').version")
    should_bump=false

    if $DRY_RUN || [ "${FORCE_PACKAGE_BUMP:-false}" = "true" ]; then
      should_bump=true
    else
      remote_version=$(npm view "$package_name" version --registry https://registry.npmjs.org/ 2>/dev/null || true)
      if [ "$current_version" = "$remote_version" ] || npm view "$package_name@$current_version" version --registry https://registry.npmjs.org/ >/dev/null 2>&1; then
        should_bump=true
      fi
    fi

    if $should_bump; then
      echo "==> Bumping $(basename "$directory") ($BUMP)..."
      run_in_dir "$directory" npm version "$BUMP" --no-git-tag-version
    else
      echo "==> Keeping unpublished $package_name@$current_version."
    fi
    if [ "$(basename "$directory")" = "lixeditor" ] && ! $DRY_RUN; then
      local version
      version=$(node -p "require('$directory/package.json').version")
      node -e '
        const fs = require("node:fs");
        const [lockPath, version] = process.argv.slice(1);
        const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        if (lock.packages?.["packages/lixeditor"]) {
          lock.packages["packages/lixeditor"].version = version;
          fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
        }
      ' "$SCRIPT_DIR/package-lock.json" "$version"
    fi
  done < <(selected_package_dirs)
}

package_artifact_dir() {
  printf '%s/%s\n' "$RELEASE_ARTIFACT_ROOT" "$(basename "$1")"
}

pack_package_artifact() {
  local directory="$1"
  local artifact_dir
  artifact_dir=$(package_artifact_dir "$directory")

  if $DRY_RUN; then
    echo "[dry-run] pack $(basename "$directory") into $artifact_dir"
    return
  fi

  mkdir -p "$artifact_dir"
  rm -f "$artifact_dir"/*.tgz "$artifact_dir"/*.sha256

  local tarball
  tarball=$(cd "$directory" && npm pack --silent --pack-destination "$artifact_dir" | tail -n 1)
  if [ -z "$tarball" ] || [ ! -f "$artifact_dir/$tarball" ]; then
    echo "Error: npm did not create the expected package artifact for $(basename "$directory")."
    exit 1
  fi
  (cd "$artifact_dir" && sha256sum "$tarball" > "$tarball.sha256")
  echo "==> Packed $artifact_dir/$tarball"
}

build_selected_packages() {
  if $SELECT_LIXEDITOR; then
    echo "==> Building @elixpo/lixeditor..."
    run_in_dir "$SCRIPT_DIR/packages/lixeditor" npm run build
    pack_package_artifact "$SCRIPT_DIR/packages/lixeditor"
  fi
  if $SELECT_CLI; then
    echo "==> Building and verifying @elixpo/lixblogs-cli package..."
    pack_package_artifact "$SCRIPT_DIR/packages/lixblogs-cli"
  fi
}

package_artifact() {
  local directory="$1"
  local artifact_dir
  artifact_dir=$(package_artifact_dir "$directory")

  if $DRY_RUN; then
    printf '%s/%s-dry-run.tgz\n' "$artifact_dir" "$(basename "$directory")"
    return
  fi

  local artifacts=("$artifact_dir"/*.tgz)
  if [ ${#artifacts[@]} -ne 1 ] || [ ! -f "${artifacts[0]}" ]; then
    echo "Error: expected one packed artifact in $artifact_dir. Run the build phase first." >&2
    exit 1
  fi
  printf '%s\n' "${artifacts[0]}"
}

published_artifact_matches() {
  local package_name="$1"
  local version="$2"
  local artifact="$3"
  local registry="$4"
  local auth_token="${5:-}"
  local remote_integrity=""
  local local_integrity

  if [ -n "$auth_token" ]; then
    remote_integrity=$(npm view "$package_name@$version" dist.integrity \
      --registry "$registry" \
      "--//${registry#https://}:_authToken=$auth_token" 2>/dev/null || true)
  else
    remote_integrity=$(npm view "$package_name@$version" dist.integrity \
      --registry "$registry" 2>/dev/null || true)
  fi
  [ -n "$remote_integrity" ] || return 1

  local_integrity=$(node -e '
    const { createHash } = require("node:crypto");
    const { readFileSync } = require("node:fs");
    process.stdout.write(`sha512-${createHash("sha512").update(readFileSync(process.argv[1])).digest("base64")}`);
  ' "$artifact")
  if [ "$local_integrity" != "$remote_integrity" ]; then
    echo "Error: $package_name@$version already exists at $registry with different contents." >&2
    exit 1
  fi
  echo "==> $package_name@$version already exists at $registry with matching integrity; skipping."
}

publish_npm_package() {
  local directory="$1"
  local artifact
  artifact=$(package_artifact "$directory")
  local package_name
  case "$(basename "$directory")" in
    lixeditor) package_name="@elixpo/lixeditor" ;;
    lixblogs-cli) package_name="@elixpo/lixblogs-cli" ;;
    *) package_name="$(basename "$directory")" ;;
  esac
  echo "==> Publishing $package_name to npm..."
  local version
  version=$(node -p "require('$directory/package.json').version")

  if ! $DRY_RUN && published_artifact_matches "$package_name" "$version" "$artifact" "https://registry.npmjs.org/"; then
    return
  fi

  local publish_args=(publish "$artifact" --access public --registry https://registry.npmjs.org/)
  # npm provenance depends on GitHub Actions' OIDC environment. Passing the
  # flag from a developer terminal makes npm fail with provider: null.
  if [ "${GITHUB_ACTIONS:-false}" = "true" ]; then
    publish_args+=(--provenance)
  fi

  if [ -n "$NPM_PUBLISH_TOKEN" ]; then
    publish_args+=("--//registry.npmjs.org/:_authToken=$NPM_PUBLISH_TOKEN")
    run_in_dir "$SCRIPT_DIR" npm "${publish_args[@]}"
  elif [ "${NPM_TRUSTED_PUBLISHING:-false}" = "true" ]; then
    if [ "${GITHUB_ACTIONS:-false}" != "true" ]; then
      echo "Error: npm trusted publishing requires the GitHub Actions OIDC environment."
      exit 1
    fi
    run_in_dir "$SCRIPT_DIR" npm "${publish_args[@]}"
  else
    if ! $DRY_RUN && ! npm whoami --registry https://registry.npmjs.org/ >/dev/null 2>&1; then
      echo "Error: npm is not authenticated. Run 'npm login' or set NPM_TOKEN."
      exit 1
    fi
    run_in_dir "$SCRIPT_DIR" npm "${publish_args[@]}"
  fi
}

publish_selected_npm_packages() {
  NPM_PUBLISH_TOKEN="${NPM_TOKEN:-}"
  if $DRY_RUN; then
    NPM_PUBLISH_TOKEN="dry-run"
  elif [ -z "$NPM_PUBLISH_TOKEN" ] && [ "${NPM_TRUSTED_PUBLISHING:-false}" != "true" ] && ! npm whoami --registry https://registry.npmjs.org/ >/dev/null 2>&1; then
    load_env
    NPM_PUBLISH_TOKEN="${NPM_TOKEN:-}"
  fi
  local directory
  while IFS= read -r directory; do
    [ -n "$directory" ] || continue
    publish_npm_package "$directory"
  done < <(selected_package_dirs)
}

publish_github_package() {
  local directory="$1"
  local artifact
  artifact=$(package_artifact "$directory")
  local package_name
  case "$(basename "$directory")" in
    lixeditor) package_name="@elixpo/lixeditor" ;;
    lixblogs-cli) package_name="@elixpo/lixblogs-cli" ;;
    *) package_name="$(basename "$directory")" ;;
  esac
  echo "==> Publishing $package_name to GitHub Packages..."

  if [ -z "$GITHUB_PUBLISH_TOKEN" ]; then
    echo "Error: GITHUB_ACCESS_TOKEN or GH_TOKEN is required for GitHub Packages."
    exit 1
  fi

  local version
  version=$(node -p "require('$directory/package.json').version")
  if ! $DRY_RUN && published_artifact_matches "$package_name" "$version" "$artifact" "https://npm.pkg.github.com/" "$GITHUB_PUBLISH_TOKEN"; then
    return
  fi

  run_in_dir "$SCRIPT_DIR" npm publish "$artifact" --access public \
    --registry https://npm.pkg.github.com/ \
    "--//npm.pkg.github.com/:_authToken=$GITHUB_PUBLISH_TOKEN"
}

publish_selected_github_packages() {
  GITHUB_PUBLISH_TOKEN="${GITHUB_ACCESS_TOKEN:-${GH_TOKEN:-}}"
  if $DRY_RUN; then
    GITHUB_PUBLISH_TOKEN="dry-run"
  elif [ -z "$GITHUB_PUBLISH_TOKEN" ]; then
    GITHUB_PUBLISH_TOKEN="$(gh auth token 2>/dev/null || true)"
    if [ -z "$GITHUB_PUBLISH_TOKEN" ]; then
      load_env
      GITHUB_PUBLISH_TOKEN="${GITHUB_ACCESS_TOKEN:-${GH_TOKEN:-}}"
    fi
  fi
  local directory
  while IFS= read -r directory; do
    [ -n "$directory" ] || continue
    publish_github_package "$directory"
  done < <(selected_package_dirs)
}

vscode_build() {
  echo "==> Building VS Code extension..."
  if ! $DRY_RUN; then
    rm -f "$SCRIPT_DIR/packages/vscode-lixeditor"/*.vsix
  fi
  run_in_dir "$SCRIPT_DIR/packages/vscode-lixeditor" npm run build
  run_in_dir "$SCRIPT_DIR/packages/vscode-lixeditor" npx @vscode/vsce package --no-dependencies
}

vscode_deploy() {
  VSCE_PUBLISH_TOKEN="${VSCE_PAT:-}"
  if $DRY_RUN; then
    VSCE_PUBLISH_TOKEN="dry-run"
  elif [ -z "$VSCE_PUBLISH_TOKEN" ]; then
    load_env
    VSCE_PUBLISH_TOKEN="${VSCE_PAT:-}"
  fi
  if [ -z "$VSCE_PUBLISH_TOKEN" ]; then
    echo "Error: VSCE_PAT is required to publish the VS Code extension."
    exit 1
  fi
  local artifacts=("$SCRIPT_DIR/packages/vscode-lixeditor"/*.vsix)
  if ! $DRY_RUN && { [ ${#artifacts[@]} -ne 1 ] || [ ! -f "${artifacts[0]}" ]; }; then
    echo "Error: expected one VS Code package. Run the build phase first."
    exit 1
  fi
  local artifact="${artifacts[0]}"
  $DRY_RUN && artifact="$SCRIPT_DIR/packages/vscode-lixeditor/lixeditor-dry-run.vsix"
  echo "==> Publishing VS Code extension..."
  run_in_dir "$SCRIPT_DIR/packages/vscode-lixeditor" npx @vscode/vsce publish \
    --packagePath "$artifact" --pat "$VSCE_PUBLISH_TOKEN"
}

run_target_standard() {
  local target=""
  local use_vscode=false
  local selector_seen=false
  local action_build=false
  local action_deploy=false

  SELECT_LIXEDITOR=false
  SELECT_CLI=false
  BUMP="patch"
  NO_BUMP=false
  DRY_RUN=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --package|--worker|--pages|--github)
        if [ -n "$target" ]; then
          echo "Error: choose exactly one deployment target."
          exit 1
        fi
        target="${1#--}"
        ;;
      --vs) use_vscode=true ;;
      --lixeditor) SELECT_LIXEDITOR=true; selector_seen=true ;;
      --cli) SELECT_CLI=true; selector_seen=true ;;
      --patch) BUMP="patch" ;;
      --minor) BUMP="minor" ;;
      --major) BUMP="major" ;;
      --no-bump) NO_BUMP=true ;;
      --dry-run) DRY_RUN=true ;;
      build) action_build=true ;;
      deploy) action_deploy=true ;;
      -h|--help|help) usage; return ;;
      *) echo "Error: unknown argument '$1'."; usage; exit 1 ;;
    esac
    shift
  done

  if [ -z "$target" ]; then
    echo "Error: choose --package, --worker, --pages, or --github."
    exit 1
  fi
  if ! $action_build && ! $action_deploy; then
    echo "Error: choose at least one phase: build or deploy."
    exit 1
  fi

  if $use_vscode && [ "$target" != "package" ]; then
    echo "Error: --vs is only valid with --package."
    exit 1
  fi
  if $selector_seen && [ "$target" != "package" ] && [ "$target" != "github" ]; then
    echo "Error: --lixeditor and --cli are only valid with package targets."
    exit 1
  fi
  if $use_vscode && $selector_seen; then
    echo "Error: --vs cannot be combined with --lixeditor or --cli."
    exit 1
  fi

  if [ "$target" = "package" ] && $use_vscode; then
    if ! $NO_BUMP; then
      run_in_dir "$SCRIPT_DIR/packages/vscode-lixeditor" npm version "$BUMP" --no-git-tag-version
    fi
    if $action_build; then vscode_build; fi
    if $action_deploy; then vscode_deploy; fi
    return 0
  fi

  if [ "$target" = "package" ] || [ "$target" = "github" ]; then
    if ! $selector_seen; then
      SELECT_LIXEDITOR=true
      SELECT_CLI=true
    fi
    bump_selected_packages
    $action_build && build_selected_packages
    if $action_deploy; then
      if [ "$target" = "package" ]; then
        publish_selected_npm_packages
      else
        publish_selected_github_packages
      fi
    fi
    return
  fi

  case "$target" in
    worker)
      if $action_build; then worker_build; fi
      if $action_deploy; then worker_deploy; fi
      ;;
    pages)
      if $action_build; then pages_build; fi
      if $action_deploy; then pages_deploy; fi
      ;;
  esac

  return 0
}

# ── Release Commands ─────────────────────────────────────────

generate_changelog() {
  if $SKIP_CHANGELOG; then
    echo "==> Skipping changelog generation"
    return
  fi

  echo "==> Generating changelog..."

  local DATE
  DATE=$(date +%Y-%m-%d)

  # Simple changelog — just list recent commits
  local COMMITS
  COMMITS=$(git log --oneline -20 2>/dev/null || echo "No commits found")

  local ENTRY
  ENTRY="
## v${NEW_VERSION} ($DATE)

${COMMITS}
"

  if [ -f "$SCRIPT_DIR/CHANGELOG.md" ]; then
    local EXISTING
    EXISTING=$(cat "$SCRIPT_DIR/CHANGELOG.md")
    printf "# Changelog\n%s\n%s" "$ENTRY" "$EXISTING" > "$SCRIPT_DIR/CHANGELOG.md"
  else
    printf "# Changelog\n%s\n" "$ENTRY" > "$SCRIPT_DIR/CHANGELOG.md"
  fi

  echo "==> Changelog updated"
}

do_release() {
  local BUMP="patch"
  local DRY_RUN=false
  local SKIP_CHANGELOG=false
  local NO_BUMP=false
  local RELEASE_NPM=false
  local RELEASE_CLI=false
  local RELEASE_GITHUB=false
  local RELEASE_VSCODE=false
  local RELEASE_WEB=false
  local TARGETS=()

  # Parse release sub-args
  for arg in "$@"; do
    case "$arg" in
      --patch)  BUMP="patch" ;;
      --minor)  BUMP="minor" ;;
      --major)  BUMP="major" ;;
      --no-bump) NO_BUMP=true ;;
      --dry-run) DRY_RUN=true ;;
      --skip-changelog) SKIP_CHANGELOG=true ;;
      editor) TARGETS+=("editor") ;;
      cli)    TARGETS+=("cli") ;;
      npm)    TARGETS+=("npm") ;;
      github) TARGETS+=("github") ;;
      vscode) TARGETS+=("vscode") ;;
      web)    TARGETS+=("web") ;;
      all)    TARGETS+=("all") ;;
    esac
  done

  # Default to 'all'
  if [ ${#TARGETS[@]} -eq 0 ]; then
    TARGETS=("all")
  fi

  for t in "${TARGETS[@]}"; do
    case "$t" in
      editor) RELEASE_NPM=true; RELEASE_GITHUB=true ;;
      cli)    RELEASE_CLI=true ;;
      npm)    RELEASE_NPM=true ;;
      github) RELEASE_GITHUB=true ;;
      vscode) RELEASE_VSCODE=true ;;
      web)    RELEASE_WEB=true ;;
      all)    RELEASE_NPM=true; RELEASE_CLI=true; RELEASE_GITHUB=true; RELEASE_VSCODE=true; RELEASE_WEB=true ;;
    esac
  done

  # ── Load tokens from .env ──
  local _NPM_TOKEN=""
  local _GH_TOKEN=""
  local _VSCE_PAT=""
  if $DRY_RUN; then
    echo "==> Dry run: skipping credential loading and validation"
  else
    load_env
    _NPM_TOKEN="${NPM_TOKEN:-}"
    _GH_TOKEN="${GITHUB_ACCESS_TOKEN:-}"
    _VSCE_PAT="${VSCE_PAT:-}"

    # Validate tokens based on targets
    if $RELEASE_NPM && [ -z "$_NPM_TOKEN" ]; then echo "Error: NPM_TOKEN not set in .env"; exit 1; fi
    if $RELEASE_CLI && [ -z "$_NPM_TOKEN" ] && ! npm whoami >/dev/null 2>&1; then
      echo "Error: publish authentication unavailable. Set NPM_TOKEN in .env or run npm login."
      exit 1
    fi
    if $RELEASE_GITHUB && [ -z "$_GH_TOKEN" ]; then echo "Error: GITHUB_ACCESS_TOKEN not set in .env"; exit 1; fi
    if $RELEASE_VSCODE && [ -z "$_VSCE_PAT" ]; then echo "Error: VSCE_PAT not set in .env"; exit 1; fi

    echo "==> Tokens loaded from .env"
  fi

  # ── Version Bump ──
  if $NO_BUMP; then
    echo "==> Keeping versions from package manifests (--no-bump)..."
  else
    echo "==> Bumping versions ($BUMP)..."
  fi

  if ! $NO_BUMP && { $RELEASE_NPM || $RELEASE_GITHUB; }; then
    dry_run "cd '$SCRIPT_DIR/packages/lixeditor' &&  npm version $BUMP --no-git-tag-version && cd '$SCRIPT_DIR'"
  fi
  if ! $NO_BUMP && $RELEASE_CLI; then
    dry_run "cd '$SCRIPT_DIR/packages/lixblogs-cli' && npm version $BUMP --no-git-tag-version && cd '$SCRIPT_DIR'"
  fi
  if ! $NO_BUMP && $RELEASE_WEB; then
    dry_run " npm version $BUMP --no-git-tag-version"
  fi

  local CLI_VERSION=""
  if $RELEASE_NPM || $RELEASE_GITHUB; then
    NEW_VERSION=$(node -p "require('./packages/lixeditor/package.json').version" 2>/dev/null || echo "0.0.0")
  elif $RELEASE_CLI; then
    NEW_VERSION=$(node -p "require('./packages/lixblogs-cli/package.json').version" 2>/dev/null || echo "0.0.0")
  elif $RELEASE_VSCODE; then
    NEW_VERSION=$(node -p "require('./packages/vscode-lixeditor/package.json').version" 2>/dev/null || echo "0.0.0")
  else
    NEW_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")
  fi

  if $RELEASE_CLI; then
    CLI_VERSION=$(node -p "require('./packages/lixblogs-cli/package.json').version" 2>/dev/null || echo "0.0.0")
    echo "==> LixBlogs CLI version: v${CLI_VERSION}"
  fi

  echo "==> New version: v${NEW_VERSION}"

  # ── Changelog ──
  generate_changelog

  # ── Build (needed for both npm and github) ──
  if $RELEASE_NPM || $RELEASE_GITHUB; then
    echo ""
    echo "==> Building @elixpo/lixeditor..."
    dry_run "cd '$SCRIPT_DIR/packages/lixeditor' && npm run build"
    echo "    ✓ Build complete"
  fi

  if $RELEASE_CLI; then
    echo ""
    echo "==> Verifying lixblogs-cli..."
    dry_run "cd '$SCRIPT_DIR/packages/lixblogs-cli' && npm test && npm pack --dry-run"
    echo "    ✓ CLI tests and package verification complete"
  fi

  # ── Publish to npm ──
  if $RELEASE_NPM; then
    echo ""
    echo "==> Publishing @elixpo/lixeditor to npm..."
    set +e
    dry_run "cd '$SCRIPT_DIR/packages/lixeditor' &&  npm publish --access public --registry https://registry.npmjs.org/ --//registry.npmjs.org/:_authToken='$_NPM_TOKEN'"
    if [ $? -eq 0 ]; then echo "    ✓ npm publish complete"; else echo "    ✗ npm publish failed"; fi
    set -e
  fi

  # ── Publish LixBlogs CLI to npm ──
  if $RELEASE_CLI; then
    echo ""
    echo "==> Publishing lixblogs-cli@${CLI_VERSION} to npm..."
    if $DRY_RUN; then
      echo "[dry-run] cd '$SCRIPT_DIR/packages/lixblogs-cli' && npm publish --access public --registry https://registry.npmjs.org/ --<npm-auth-redacted>"
      echo "    ✓ lixblogs-cli@${CLI_VERSION} would be published"
    elif [ -n "${NPM_OTP:-}" ]; then
      if [ -n "$_NPM_TOKEN" ]; then
        (cd "$SCRIPT_DIR/packages/lixblogs-cli" && npm publish --access public --registry https://registry.npmjs.org/ "--//registry.npmjs.org/:_authToken=$_NPM_TOKEN" "--otp=${NPM_OTP}") || {
          echo "    ✗ CLI publish failed. Check the npm token permissions and NPM_OTP."
          exit 1
        }
      else
        (cd "$SCRIPT_DIR/packages/lixblogs-cli" && npm publish --access public --registry https://registry.npmjs.org/ "--otp=${NPM_OTP}") || {
          echo "    ✗ CLI publish failed. Check the active npm login and NPM_OTP."
          exit 1
        }
      fi
      echo "    ✓ lixblogs-cli@${CLI_VERSION} published"
    elif [ -n "$_NPM_TOKEN" ]; then
      (cd "$SCRIPT_DIR/packages/lixblogs-cli" && npm publish --access public --registry https://registry.npmjs.org/ "--//registry.npmjs.org/:_authToken=$_NPM_TOKEN") || {
        echo "    ✗ CLI publish failed. Use an npm granular token with publish permission and 2FA bypass, or set a current NPM_OTP."
        exit 1
      }
      echo "    ✓ lixblogs-cli@${CLI_VERSION} published"
    else
      (cd "$SCRIPT_DIR/packages/lixblogs-cli" && npm publish --access public --registry https://registry.npmjs.org/) || {
        echo "    ✗ CLI publish failed. Check the active npm login; if the account requires 2FA, set NPM_OTP."
        exit 1
      }
      echo "    ✓ lixblogs-cli@${CLI_VERSION} published"
    fi
  fi

  # ── Publish to GitHub Packages ──
  if $RELEASE_GITHUB; then
    echo ""
    echo "==> Publishing @elixpo/lixeditor to GitHub Packages..."
    set +e
    # Write a temp .npmrc for GitHub Packages auth
    local EDITOR_DIR="$SCRIPT_DIR/packages/lixeditor"
    local NPMRC_BAK=""
    if [ -f "$EDITOR_DIR/.npmrc" ]; then
      NPMRC_BAK=$(cat "$EDITOR_DIR/.npmrc")
    fi
    printf "@elixpo:registry=https://npm.pkg.github.com/\n//npm.pkg.github.com/:_authToken=%s\n" "$_GH_TOKEN" > "$EDITOR_DIR/.npmrc"

    dry_run "cd '$EDITOR_DIR' &&  npm publish --access public"
    if [ $? -eq 0 ]; then echo "    ✓ GitHub Packages publish complete"; else echo "    ✗ GitHub Packages publish failed"; fi

    # Restore or remove .npmrc
    if [ -n "$NPMRC_BAK" ]; then
      echo "$NPMRC_BAK" > "$EDITOR_DIR/.npmrc"
    else
      rm -f "$EDITOR_DIR/.npmrc"
    fi
    set -e
  fi

  # ── Publish VS Code Extension ──
  if $RELEASE_VSCODE; then
    echo ""
    echo "==> [1/3] Bumping VS Code extension version ($BUMP)..."
    dry_run "cd '$SCRIPT_DIR/packages/vscode-lixeditor' &&  npm version $BUMP --no-git-tag-version && cd '$SCRIPT_DIR'"

    local VSCODE_VERSION
    VSCODE_VERSION=$(node -p "require('./packages/vscode-lixeditor/package.json').version" 2>/dev/null || echo "0.0.0")
    echo "    Extension version: $VSCODE_VERSION"

    echo ""
    echo "==> [2/3] Building VS Code extension..."
    dry_run "cd '$SCRIPT_DIR/packages/vscode-lixeditor' && npm run build"

    echo ""
    echo "==> [3/3] Publishing LixEditor to VS Code Marketplace..."
    set +e
    dry_run "cd '$SCRIPT_DIR/packages/vscode-lixeditor' && npx @vscode/vsce package --no-dependencies && npx @vscode/vsce publish --no-dependencies --pat '$_VSCE_PAT'"
    if [ $? -eq 0 ]; then echo "    ✓ VS Code extension v$VSCODE_VERSION published"; else echo "    ✗ VS Code extension publish failed"; fi
    set -e
  fi

  if $RELEASE_WEB; then
    echo "==> Building & deploying website..."
    dry_run "cd '$SCRIPT_DIR' &&  npm run pages:build"
    dry_run "cd '$SCRIPT_DIR' &&  npx wrangler pages deploy .vercel/output/static --project-name lixblogs --branch main"
    echo "==> Website deployed"
  fi

  # ── Git Tag & Push ──
  echo "==> Committing and tagging v${NEW_VERSION}..."
  dry_run " git add -A"
  dry_run " git commit -m 'release: v${NEW_VERSION}' || true"
  if $RELEASE_NPM || $RELEASE_GITHUB || $RELEASE_VSCODE || $RELEASE_WEB; then
    dry_run " git tag 'v${NEW_VERSION}'"
  fi
  if $RELEASE_CLI; then
    dry_run " git tag 'lixblogs-cli-v${CLI_VERSION}'"
  fi
  dry_run " git push \"\$(auth_remote)\" main --tags"

  # ── GitHub Release (skipped — using GitHub Packages instead) ──

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Release v${NEW_VERSION} complete!"
  echo ""
  $RELEASE_NPM    && echo "  - @elixpo/lixeditor published to npm"
  if $RELEASE_CLI; then
    if $DRY_RUN; then
      echo "  - lixblogs-cli@${CLI_VERSION} would be published to npm"
    else
      echo "  - lixblogs-cli@${CLI_VERSION} published to npm"
    fi
  fi
  $RELEASE_GITHUB && echo "  - @elixpo/lixeditor published to GitHub Packages"
  $RELEASE_VSCODE && echo "  - LixEditor VS Code extension published"
  $RELEASE_WEB    && echo "  - Website deployed to Cloudflare Pages"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Usage ────────────────────────────────────────────────────

usage() {
  echo "Usage: ./deploy.sh TARGET [SELECTOR] PHASE... [options]"
  echo ""
  echo "Targets:"
  echo "  --package           npm packages; defaults to lixeditor + CLI"
  echo "  --package --vs      VS Code extension"
  echo "  --worker            Cloudflare Workers"
  echo "  --pages             Cloudflare Pages site"
  echo "  --github            GitHub Packages mirror; defaults to lixeditor + CLI"
  echo ""
  echo "Package selectors:"
  echo "  --lixeditor         Select only @elixpo/lixeditor"
  echo "  --cli               Select only @elixpo/lixblogs-cli"
  echo "  (none)              Select and auto-bump both packages"
  echo ""
  echo "Phases:"
  echo "  build               Build/package the selected target"
  echo "  deploy              Publish/deploy the selected target"
  echo ""
  echo "Options:"
  echo "  --patch             Patch package version bump (default)"
  echo "  --minor             Minor version bump"
  echo "  --major             Major version bump"
  echo "  --no-bump           Keep package manifest versions"
  echo "  --dry-run           Print actions without executing them"
  echo ""
  echo "Examples:"
  echo "  ./deploy.sh --package build deploy"
  echo "  ./deploy.sh --package --lixeditor build deploy"
  echo "  ./deploy.sh --package --cli build deploy"
  echo "  ./deploy.sh --package --vs build deploy"
  echo "  ./deploy.sh --worker build deploy"
  echo "  ./deploy.sh --pages build deploy"
  echo "  ./deploy.sh --github build deploy"
  echo ""
  echo "Legacy commands remain available during migration: release, secrets, all."
}

# ── Entrypoint ───────────────────────────────────────────────

# DRY_RUN default for non-release commands
DRY_RUN=false
SKIP_CHANGELOG=false
NEW_VERSION=""

run_command() {
  case "$1" in
    deploy)  deploy ;;
    worker)  worker ;;
    secrets) secrets ;;
    build)   build ;;
    sync)    sync_d1 ;;
    all)     worker; secrets; deploy ;;
    release) shift; do_release "$@"; exit 0 ;;
    -h|--help|help) usage ;;
    *)
      echo "Unknown command: $1"
      usage
      exit 1
      ;;
  esac
}

if [ $# -gt 0 ] && [[ "$1" =~ ^--(package|worker|pages|github)$ ]]; then
  run_target_standard "$@"
elif [ $# -eq 0 ]; then
  deploy
elif [ "$1" = "release" ]; then
  shift
  do_release "$@"
else
  for cmd in "$@"; do
    run_command "$cmd"
  done
fi
