#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
upstream_version="$(sed -n 's/^__version__ = "\([^"]*\)"/\1/p' "$project_dir/screenbridge/__init__.py")"
revision=1

if [[ $# -gt 0 ]]; then
    if [[ "$1" != "--revision" || $# -ne 2 ]]; then
        echo "Usage: $0 [--revision POSITIVE_INTEGER]" >&2
        exit 2
    fi
    revision="$2"
fi

if [[ -z "$upstream_version" ]]; then
    echo "Could not read the ScreenBridge version." >&2
    exit 1
fi
if [[ ! "$revision" =~ ^[1-9][0-9]*$ ]]; then
    echo "Debian revision must be a positive integer." >&2
    exit 2
fi

version="${upstream_version}-${revision}"

build_dir="$(mktemp -d -t screenbridge-package.XXXXXXXX)"
cleanup() {
    if [[ "$build_dir" == /tmp/screenbridge-package.* && -d "$build_dir" ]]; then
        rm -rf -- "$build_dir"
    fi
}
trap cleanup EXIT

package_root="$build_dir/screenbridge"
mkdir -p \
    "$package_root/DEBIAN" \
    "$package_root/usr/bin" \
    "$package_root/usr/lib/screenbridge" \
    "$package_root/usr/share/applications" \
    "$package_root/usr/share/doc/screenbridge" \
    "$package_root/usr/share/icons/hicolor/scalable/apps" \
    "$package_root/usr/share/metainfo" \
    "$project_dir/dist"

sed "s/@VERSION@/$version/g" "$project_dir/packaging/debian/control" \
    > "$package_root/DEBIAN/control"
cp -R "$project_dir/screenbridge" "$package_root/usr/lib/screenbridge/"
find "$package_root/usr/lib/screenbridge" -type d -name __pycache__ -prune -exec rm -rf -- {} +
install -m 0755 "$project_dir/packaging/screenbridge" "$package_root/usr/bin/screenbridge"
sed 's|@EXEC@|screenbridge|g' "$project_dir/io.github.screenbridge.app.desktop.in" \
    > "$package_root/usr/share/applications/io.github.screenbridge.app.desktop"
install -m 0644 "$project_dir/assets/io.github.screenbridge.app.svg" \
    "$package_root/usr/share/icons/hicolor/scalable/apps/io.github.screenbridge.app.svg"
sed "s/@VERSION@/$upstream_version/g" "$project_dir/packaging/io.github.screenbridge.app.metainfo.xml.in" \
    > "$package_root/usr/share/metainfo/io.github.screenbridge.app.metainfo.xml"
install -m 0644 "$project_dir/LICENSE" "$package_root/usr/share/doc/screenbridge/copyright"

find "$package_root" -type d -exec chmod 0755 {} +
find "$package_root/usr/lib/screenbridge" -type f -exec chmod 0644 {} +
chmod 0644 \
    "$package_root/DEBIAN/control" \
    "$package_root/usr/share/applications/io.github.screenbridge.app.desktop" \
    "$package_root/usr/share/icons/hicolor/scalable/apps/io.github.screenbridge.app.svg" \
    "$package_root/usr/share/metainfo/io.github.screenbridge.app.metainfo.xml"

if command -v desktop-file-validate >/dev/null 2>&1; then
    desktop-file-validate "$package_root/usr/share/applications/io.github.screenbridge.app.desktop"
fi
if command -v appstreamcli >/dev/null 2>&1; then
    appstreamcli validate --no-net "$package_root/usr/share/metainfo/io.github.screenbridge.app.metainfo.xml"
fi

output="$project_dir/dist/screenbridge_${version}_all.deb"
dpkg-deb --root-owner-group --build "$package_root" "$output"
echo "$output"
