#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
    echo "Usage: $0 BINARY VERSION ARCHITECTURE OUTPUT_DIRECTORY" >&2
    exit 2
fi

binary=$(realpath "$1")
version=${2#v}
architecture=$3
output_directory=$(realpath -m "$4")

[[ -f "$binary" ]] || { echo "Crumb binary not found: $binary" >&2; exit 1; }
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([~+.-][0-9A-Za-z.+~-]+)?$ ]] || {
    echo "Invalid Debian upstream version: $version" >&2
    exit 1
}
[[ "$architecture" == "amd64" || "$architecture" == "arm64" ]] || {
    echo "Unsupported Debian architecture: $architecture" >&2
    exit 1
}

# The ~elixpo suffix sorts below the official Debian revision of the same
# upstream version, so the archive package wins when both are available.
package_version="${version}-1~elixpo1"
stage=$(mktemp -d -t crumb-deb.XXXXXXXX)
cleanup() {
    if [[ "$stage" == /tmp/crumb-deb.* && -d "$stage" ]]; then
        rm -rf -- "$stage"
    fi
}
trap cleanup EXIT

chmod 755 "$stage"
install -d -m 755 \
    "$stage/DEBIAN" \
    "$stage/usr" \
    "$stage/usr/bin" \
    "$stage/usr/share" \
    "$stage/usr/share/doc" \
    "$stage/usr/share/doc/crumb"
install -m 755 "$binary" "$stage/usr/bin/crumb"
install -m 644 LICENSE "$stage/usr/share/doc/crumb/copyright"

cat > "$stage/DEBIAN/control" <<EOF
Package: crumb
Version: $package_version
Section: utils
Priority: optional
Architecture: $architecture
Maintainer: Ayushman Bhattacharya <ayushman.elixpo@gmail.com>
Homepage: https://crumb.elixpo.com
Depends: ca-certificates, libc6 (>= 2.39), libgcc-s1
Description: self-hosted agent harness and natural-language terminal
 Crumb combines a normal interactive terminal with an autonomous agent harness.
 Commands remain available without AI, while optional Pollinations-powered
 workflows operate within explicit tool, permission, session, and memory
 boundaries controlled by the user.
EOF

install -d -m 755 "$output_directory"
# GitHub rewrites "~" in release asset names, so keep it out of the file name;
# apt compares the Version field, not the file name.
package="$output_directory/crumb_${package_version//\~/.}_${architecture}.deb"
dpkg-deb --root-owner-group --build "$stage" "$package"
dpkg-deb --info "$package"
echo "$package"
