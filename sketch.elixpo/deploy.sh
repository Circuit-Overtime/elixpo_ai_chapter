#!/usr/bin/env bash
set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LixSketch Deploy — unified flag-based standard (elixpo/sketch.elixpo#124)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Usage:
#   ./deploy.sh --package [--name <pkg>] build|deploy   (npm package)
#   ./deploy.sh --package --vs           build|deploy   (VS Code extension)
#   ./deploy.sh --worker                 build|deploy   (Cloudflare Worker)
#   ./deploy.sh --pages                  build|deploy   (Cloudflare Pages)
#   ./deploy.sh --github                 build|deploy   (GitHub Packages mirror of npm)
#
# build and deploy may be passed together (build deploy) or separately —
# CI can run them as two steps for caching, a human can run them together.
#
# Bump/publish-safety logic below is ported from publish-npm.yml /
# publish-vscode.yml (this repo's CI), not re-derived — those workflows'
# registry-check + loop-guard behavior is more robust than this script's
# previous version and is now the single source of truth for both a
# local run and a CI run.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
PAGES_PROJECT="lixsketch"
PAGES_BRANCH="main"
NPM_PACKAGE_DIR="packages/lixsketch"
NPM_PACKAGE_NAME="@elixpo/lixsketch"
VSCODE_DIR="packages/vscode"
VSCODE_EXT_ID="elixpo.lixsketch"

# ── Env loading (unchanged from the existing script — SOPS-aware) ──

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env not found at $ENV_FILE"
    exit 1
  fi
  local _env_content
  if grep -q 'ENC\[' "$ENV_FILE" 2>/dev/null || grep -q '^sops' "$ENV_FILE" 2>/dev/null; then
    if ! command -v sops >/dev/null 2>&1; then
      echo "Error: .env is SOPS-encrypted but the 'sops' CLI is not installed."
      echo "       Install it from https://github.com/getsops/sops/releases"
      exit 1
    fi
    if [ -z "${SOPS_AGE_KEY:-}" ] && [ -f "$HOME/.sops/elixpo-age-key.txt" ]; then
      export SOPS_AGE_KEY="$(grep 'AGE-SECRET-KEY' "$HOME/.sops/elixpo-age-key.txt" | head -1)"
    fi
    _env_content="$(sops -d "$ENV_FILE")" || {
      echo "Error: failed to decrypt $ENV_FILE (set SOPS_AGE_KEY or ~/.sops/elixpo-age-key.txt)"
      exit 1
    }
  else
    _env_content="$(cat "$ENV_FILE")"
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    [[ "$line" =~ ^sops_ ]] && continue
    export "$line" 2>/dev/null || true
  done <<< "$_env_content"
}

auth_remote() {
  local url
  url=$(git remote get-url origin)
  echo "${url/https:\/\//https:\/\/${GITHUB_ACCESS_TOKEN}@}"
}

configure_bot_git() {
  git config --global user.name "elixpoo"
  git config --global user.email "269200728+elixpoo@users.noreply.github.com"
}

# ── Ported bump-detection (from publish-npm.yml / publish-vscode.yml) ──

compute_npm_version_bump() {
  local pkg_dir="$1" pkg_name="$2" bump_kind="${3:-patch}"
  local local_version remote_version
  local_version=$(node -p "require('./$pkg_dir/package.json').version")
  remote_version=$(npm view "$pkg_name" version 2>/dev/null || echo "unknown")

  echo "  Local  version: $local_version"
  echo "  Remote version: $remote_version"

  local needs_bump=false
  if [ "$local_version" = "$remote_version" ]; then
    needs_bump=true
  elif [ "$remote_version" = "unknown" ]; then
    if npm view "${pkg_name}@${local_version}" version >/dev/null 2>&1; then
      echo "  $local_version already exists on the registry — bumping."
      needs_bump=true
    fi
  fi

  if [ "$needs_bump" = "true" ]; then
    (cd "$pkg_dir" && npm version "$bump_kind" --no-git-tag-version > /dev/null)
    BUMP_VERSION=$(node -p "require('./$pkg_dir/package.json').version")
    BUMP_HAPPENED=true
    echo "  Bumped to $BUMP_VERSION"
  else
    BUMP_VERSION="$local_version"
    BUMP_HAPPENED=false
    echo "  Local ($local_version) ahead of remote — using as-is."
  fi
}

compute_vscode_version_bump() {
  local pkg_dir="$1" ext_id="$2" bump_kind="${3:-patch}"
  local local_version remote_version
  local_version=$(node -p "require('./$pkg_dir/package.json').version")
  remote_version=$(npx --yes @vscode/vsce show "$ext_id" --json 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s);console.log(j.versions?.[0]?.version||'0.0.0')}catch{console.log('0.0.0')}})" \
    || echo "0.0.0")

  echo "  Local  version: $local_version"
  echo "  Remote version: $remote_version"

  if [ "$local_version" = "$remote_version" ]; then
    (cd "$pkg_dir" && npm version "$bump_kind" --no-git-tag-version > /dev/null)
    BUMP_VERSION=$(node -p "require('./$pkg_dir/package.json').version")
    BUMP_HAPPENED=true
    echo "  Bumped to $BUMP_VERSION"
  else
    BUMP_VERSION="$local_version"
    BUMP_HAPPENED=false
    echo "  Local ($local_version) ahead of remote — using as-is."
  fi
}

commit_and_tag_bump() {
  local pkg_dir="$1" bump_label="$2" tag_prefix="$3"
  load_env
  configure_bot_git
  git add "$pkg_dir/package.json" "$pkg_dir/package-lock.json" 2>/dev/null || \
    git add "$pkg_dir/package.json"
  git commit -m "chore(release): bump ${bump_label} to v${BUMP_VERSION}

Auto-bumped by deploy.sh after a change under ${pkg_dir}/** was
published without a manual version bump.

[skip ci]"
  git push "$(auth_remote)" main
  git tag -a "${tag_prefix}v${BUMP_VERSION}" -m "${bump_label} v${BUMP_VERSION}"
  git push "$(auth_remote)" "${tag_prefix}v${BUMP_VERSION}"
}

package_build() {
  local pkg_dir="$1"
  echo "==> Installing dependencies for $pkg_dir..."
  npm ci
}

package_deploy() {
  local pkg_dir="$1" pkg_name="$2" bump_kind="${3:-patch}"
  load_env
  local _npm_token="${NPM_TOKEN:?NPM_TOKEN not set in .env}"

  echo "==> Checking version for $pkg_name..."
  compute_npm_version_bump "$pkg_dir" "$pkg_name" "$bump_kind"

  echo "==> Publishing $pkg_name to npm..."
  (cd "$pkg_dir" && NPM_TOKEN="$_npm_token" npm publish --access public \
    --registry https://registry.npmjs.org/ \
    --//registry.npmjs.org/:_authToken="$_npm_token")

  if [ "$BUMP_HAPPENED" = "true" ]; then
    commit_and_tag_bump "$pkg_dir" "$pkg_name" "$(basename "$pkg_dir")-"
  fi
  echo "==> $pkg_name published to npm."
}

vscode_build() {
  echo "==> Building VS Code extension..."
  (cd "$VSCODE_DIR" && npm run build)
}

vscode_deploy() {
  local bump_kind="${1:-patch}"
  load_env
  local _vsce_pat="${VSCE_PAT:?VSCE_PAT not set in .env}"

  echo "==> Checking version for $VSCODE_EXT_ID..."
  compute_vscode_version_bump "$VSCODE_DIR" "$VSCODE_EXT_ID" "$bump_kind"

  echo "==> Packaging & publishing $VSCODE_EXT_ID..."
  (cd "$VSCODE_DIR" && npx @vscode/vsce package --no-dependencies && \
    VSCE_PAT="$_vsce_pat" npx @vscode/vsce publish --no-dependencies --pat "$_vsce_pat")

  if [ "$BUMP_HAPPENED" = "true" ]; then
    commit_and_tag_bump "$VSCODE_DIR" "$VSCODE_EXT_ID" "vscode-lixsketch-"
  fi
  echo "==> $VSCODE_EXT_ID published to VS Code Marketplace."
}

github_deploy() {
  local pkg_dir="$1"
  load_env
  local _gh_token="${GITHUB_ACCESS_TOKEN:?GITHUB_ACCESS_TOKEN not set in .env}"

  echo "==> Publishing to GitHub Packages (best-effort mirror)..."
  local original_repo
  original_repo=$(node -p "JSON.stringify(require('./$pkg_dir/package.json').repository || null)")
  node -e "
    const fs = require('fs');
    const pkg = require('./$pkg_dir/package.json');
    pkg.repository = { type: 'git', url: 'git+' + require('child_process').execSync('git remote get-url origin').toString().trim().replace(/^git@github.com:/, 'https://github.com/') + '.git' };
    fs.writeFileSync('./$pkg_dir/package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  if (cd "$pkg_dir" && npm publish --access public --registry https://npm.pkg.github.com/ \
      --//npm.pkg.github.com/:_authToken="$_gh_token"); then
    echo "==> Published to GitHub Packages."
  else
    echo "==> [warn] GitHub Packages publish failed. npmjs is canonical; this mirror is best-effort."
  fi
  node -e "
    const fs = require('fs');
    const pkg = require('./$pkg_dir/package.json');
    const orig = $original_repo;
    if (orig) pkg.repository = orig; else delete pkg.repository;
    fs.writeFileSync('./$pkg_dir/package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
}

worker_build() {
  echo "==> Installing dependencies for worker..."
  npm ci
}

worker_deploy() {
  echo "==> Deploying Worker..."
  npx wrangler deploy
  echo "==> Worker deploy complete."
}

pages_build() {
  echo "==> Building for Cloudflare Pages..."
  npx @cloudflare/next-on-pages
  echo "==> Build complete (.vercel/output/static)"
}

pages_deploy() {
  if [ ! -d "$SCRIPT_DIR/.vercel/output/static" ]; then
    echo "==> No build found, building first..."
    pages_build
  fi
  echo "==> Deploying to Cloudflare Pages ($PAGES_PROJECT)..."
  npx wrangler pages deploy .vercel/output/static \
    --project-name "$PAGES_PROJECT" \
    --branch "$PAGES_BRANCH"
  echo "==> Pages deploy complete."
}

usage() {
  cat <<'USAGE_EOF'
Usage:
  ./deploy.sh --package [--name <pkg>] build|deploy   npm package (default: lixsketch)
  ./deploy.sh --package --vs           build|deploy   VS Code extension
  ./deploy.sh --worker                 build|deploy   Cloudflare Worker
  ./deploy.sh --pages                  build|deploy   Cloudflare Pages
  ./deploy.sh --github                 build|deploy   GitHub Packages mirror of npm

Options:
  --name <pkg>   which npm package, when a repo has more than one
  --patch/--minor/--major   version bump kind for publish steps (default: patch)

Examples:
  ./deploy.sh --package build deploy         # build + publish lixsketch to npm
  ./deploy.sh --package --vs build deploy    # build + publish VS Code extension
  ./deploy.sh --worker build deploy          # deploy the collab Worker
  ./deploy.sh --pages build deploy           # build + deploy the website
  ./deploy.sh --github deploy                # mirror lixsketch to GitHub Packages
USAGE_EOF
}

MODE=""
PACKAGE_NAME=""
IS_VSCODE=false
BUMP_KIND="patch"
ACTIONS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --package) MODE="package" ;;
    --worker)  MODE="worker" ;;
    --pages)   MODE="pages" ;;
    --github)  MODE="github" ;;
    --vs)      IS_VSCODE=true ;;
    --name)    shift; PACKAGE_NAME="${1:-}" ;;
    --patch)   BUMP_KIND="patch" ;;
    --minor)   BUMP_KIND="minor" ;;
    --major)   BUMP_KIND="major" ;;
    build|deploy) ACTIONS+=("$1") ;;
    -h|--help|help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

if [ -z "$MODE" ]; then
  echo "Error: one of --package, --worker, --pages, --github is required."
  usage
  exit 1
fi
if [ ${#ACTIONS[@]} -eq 0 ]; then
  echo "Error: at least one of 'build' or 'deploy' is required."
  usage
  exit 1
fi

for action in "${ACTIONS[@]}"; do
  case "$MODE" in
    package)
      if $IS_VSCODE; then
        [ "$action" = "build" ]  && vscode_build
        [ "$action" = "deploy" ] && vscode_deploy "$BUMP_KIND"
      else
        target_dir="$NPM_PACKAGE_DIR"
        target_name="$NPM_PACKAGE_NAME"
        if [ -n "$PACKAGE_NAME" ]; then
          echo "==> [warn] --name '$PACKAGE_NAME' given, but this repo only has one npm package (lixsketch). Ignoring."
        fi
        [ "$action" = "build" ]  && package_build "$target_dir"
        [ "$action" = "deploy" ] && package_deploy "$target_dir" "$target_name" "$BUMP_KIND"
      fi
      ;;
    worker)
      [ "$action" = "build" ]  && worker_build
      [ "$action" = "deploy" ] && worker_deploy
      ;;
    pages)
      [ "$action" = "build" ]  && pages_build
      [ "$action" = "deploy" ] && pages_deploy
      ;;
    github)
      [ "$action" = "deploy" ] && github_deploy "$NPM_PACKAGE_DIR"
      [ "$action" = "build" ]  && echo "==> [info] --github has no separate build step; use --package build first."
      ;;
  esac
done
