#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
fixture=$(mktemp -d "${TMPDIR:-/tmp}/crumb-installer-test.XXXXXX")
trap 'rm -rf "$fixture"' EXIT HUP INT TERM

printf '#!/bin/sh\necho crumb-installer-fixture\n' > "$fixture/crumb"
chmod 0755 "$fixture/crumb"
tar -czf "$fixture/crumb-linux-x86_64.tar.gz" -C "$fixture" crumb
(
  cd "$fixture"
  sha256sum crumb-linux-x86_64.tar.gz > crumb-linux-x86_64.tar.gz.sha256
)

CRUMB_DOWNLOAD_BASE="file://$fixture" \
CRUMB_INSTALL_DIR="$fixture/bin" \
  sh "$repository_root/install.sh"

output=$($fixture/bin/crumb)
[ "$output" = "crumb-installer-fixture" ] || {
  echo "installer smoke test produced unexpected output: $output" >&2
  exit 1
}

echo "installer smoke test passed"
