#!/bin/sh

set -eu

repository=${CRUMB_REPOSITORY:-elixpo/crumb.elixpo}
install_dir=${CRUMB_INSTALL_DIR:-"${HOME}/.local/bin"}
version=${CRUMB_VERSION:-latest}

command -v curl >/dev/null 2>&1 || {
  echo "error: curl is required to install Crumb" >&2
  exit 1
}

case "$(uname -s)" in
  Linux) platform=linux ;;
  Darwin) platform=macos ;;
  *)
    echo "error: this installer supports Linux and macOS; use install.ps1 on Windows" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) architecture=x86_64 ;;
  arm64 | aarch64) architecture=aarch64 ;;
  *)
    echo "error: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

asset="crumb-${platform}-${architecture}.tar.gz"
if [ -n "${CRUMB_DOWNLOAD_BASE:-}" ]; then
  download_base=${CRUMB_DOWNLOAD_BASE%/}
  curl_flags="--fail --location --silent --show-error"
elif [ "$version" = latest ]; then
  download_base="https://github.com/${repository}/releases/latest/download"
  curl_flags="--proto =https --tlsv1.2 --fail --location --silent --show-error"
else
  download_base="https://github.com/${repository}/releases/download/${version}"
  curl_flags="--proto =https --tlsv1.2 --fail --location --silent --show-error"
fi

temporary=$(mktemp -d "${TMPDIR:-/tmp}/crumb-install.XXXXXX")
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

# shellcheck disable=SC2086
curl $curl_flags --output "$temporary/$asset" "$download_base/$asset"
# shellcheck disable=SC2086
curl $curl_flags --output "$temporary/$asset.sha256" "$download_base/$asset.sha256"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$temporary" && sha256sum --check "$asset.sha256")
elif command -v shasum >/dev/null 2>&1; then
  expected=$(awk '{print $1}' "$temporary/$asset.sha256")
  actual=$(shasum -a 256 "$temporary/$asset" | awk '{print $1}')
  [ "$expected" = "$actual" ] || {
    echo "error: Crumb archive checksum did not match" >&2
    exit 1
  }
else
  echo "error: sha256sum or shasum is required to verify Crumb" >&2
  exit 1
fi

tar -xzf "$temporary/$asset" -C "$temporary"
[ -f "$temporary/crumb" ] || {
  echo "error: release archive did not contain the crumb binary" >&2
  exit 1
}

mkdir -p "$install_dir"
install -m 0755 "$temporary/crumb" "$install_dir/crumb"

echo
echo "  ◆ Crumb is installed and ready to crunch."
echo "    $install_dir/crumb"
case ":${PATH}:" in
  *":${install_dir}:"*) launch_command=crumb ;;
  *)
    launch_command="$install_dir/crumb"
    echo
    echo "  Add $install_dir to PATH when you are ready."
    ;;
esac
echo
echo "  Start Crumb:  $launch_command"
echo "  Then try:"
echo "    /auth login"
echo "    explain this workspace and show me where to start"
echo "    /help"
echo
echo "  Docs: https://crumb.elixpo.com/docs/getting-started"
