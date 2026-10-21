#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 SITE_DIRECTORY PACKAGE.deb [PACKAGE.deb ...]" >&2
  exit 2
fi

site=$(realpath -m "$1")
shift
repository="$site/apt"
mkdir -p "$repository"
touch "$site/.nojekyll"

for candidate in "$@"; do
  package=$(realpath "$candidate")
  package_name=$(dpkg-deb --field "$package" Package)
  if [[ ! "$package_name" =~ ^[a-z0-9][a-z0-9+.-]+$ ]]; then
    echo "Invalid Debian package name in $package" >&2
    exit 1
  fi
  pool="$repository/pool/$package_name"
  mkdir -p "$pool"
  cp "$package" "$pool/"
done

cd "$repository"
dpkg-scanpackages --multiversion pool /dev/null > Packages
gzip -n -9 -c Packages > Packages.gz
apt-ftparchive \
  -o 'APT::FTPArchive::Release::Origin=Elixpo' \
  -o 'APT::FTPArchive::Release::Label=packages.elixpo' \
  -o 'APT::FTPArchive::Release::Suite=stable' \
  -o 'APT::FTPArchive::Release::Codename=stable' \
  -o 'APT::FTPArchive::Release::Description=Signed Linux application packages from Elixpo' \
  release . > Release

fingerprint=$(gpg --batch --with-colons --list-secret-keys | awk -F: '$1 == "fpr" {print $10; exit}')
if [[ -z "$fingerprint" ]]; then
  echo 'No APT signing key is available' >&2
  exit 1
fi
gpg --batch --yes --armor --export "$fingerprint" > keyring.asc
gpg --batch --yes --local-user "$fingerprint" --clearsign --output InRelease Release
gpg --batch --yes --local-user "$fingerprint" --armor --detach-sign --output Release.gpg Release
