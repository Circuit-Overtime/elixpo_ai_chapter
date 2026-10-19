"""Update the installed Debian package from a validated GitHub release."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

from win_dot_panel.ipc.client import send_command

RELEASES_URL = "https://api.github.com/repos/elixpo/packages.elixpo/releases"
STABLE_TAG_PREFIX = "win-dot-panel/v"
PACKAGE_NAME = re.compile(r"win-dot-panel_[^/]+_all\.deb\Z")


def _read_url(url: str) -> bytes:
    request = Request(
        url, headers={"User-Agent": "win-dot-panel", "Accept": "application/vnd.github+json"}
    )
    with urlopen(request, timeout=30) as response:
        return response.read()


def _release(channel: str) -> dict[str, object]:
    releases = json.loads(_read_url(f"{RELEASES_URL}?per_page=100"))
    if not isinstance(releases, list):
        raise TypeError("Invalid GitHub releases response")
    prefix = STABLE_TAG_PREFIX if channel == "stable" else "main-"
    prerelease = channel != "stable"
    candidates = [
        item
        for item in releases
        if isinstance(item, dict)
        and not item.get("draft")
        and bool(item.get("prerelease")) is prerelease
        and str(item.get("tag_name", "")).startswith(prefix)
    ]
    if not candidates:
        raise ValueError(f"No {channel} release is available")
    release = max(candidates, key=lambda item: str(item.get("published_at") or ""))
    if not isinstance(release, dict) or not isinstance(release.get("assets"), list):
        raise TypeError("Invalid GitHub release data")
    return release


def _assets(release: dict[str, object]) -> tuple[dict[str, str], dict[str, str]]:
    assets = release["assets"]
    packages = [
        item
        for item in assets
        if isinstance(item, dict) and PACKAGE_NAME.fullmatch(str(item.get("name", "")))
    ]
    checksums = [
        item for item in assets if isinstance(item, dict) and item.get("name") == "SHA256SUMS"
    ]
    if len(packages) != 1 or len(checksums) != 1:
        raise ValueError("Release must contain one Debian package and SHA256SUMS")
    package, checksum = packages[0], checksums[0]
    if not all(isinstance(item.get("browser_download_url"), str) for item in (package, checksum)):
        raise ValueError("Release asset download URL is missing")
    return package, checksum


def _expected_hash(checksums: bytes, filename: str) -> str:
    # GitHub replaces the tilde in snapshot asset names with a dot on upload.
    names = {filename, filename.replace(".main.", "~main.", 1)}
    for line in checksums.decode("utf-8").splitlines():
        digest, separator, name = line.partition(" ")
        if separator and name.lstrip(" *") in names and re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            return digest.lower()
    raise ValueError("Release checksum does not match the Debian package name")


def update(channel: str = "stable") -> str:
    """Verify and install the selected release, then stop any older daemon."""
    release = _release(channel)
    package, checksum = _assets(release)
    name = str(package["name"])
    expected = _expected_hash(_read_url(str(checksum["browser_download_url"])), name)
    with tempfile.TemporaryDirectory(prefix="win-dot-panel-", dir="/var/tmp") as directory:
        os.chmod(directory, 0o755)
        path = Path(directory) / name
        contents = _read_url(str(package["browser_download_url"]))
        if hashlib.sha256(contents).hexdigest() != expected:
            raise ValueError("Downloaded package failed SHA-256 verification")
        path.write_bytes(contents)
        path.chmod(0o644)
        result = subprocess.run(
            ["dpkg-deb", "--field", str(path), "Package"],
            check=True,
            capture_output=True,
            text=True,
        )
        if result.stdout.strip() != "win-dot-panel":
            raise ValueError("Downloaded file is not a win-dot-panel package")
        command = [] if os.geteuid() == 0 else ["sudo"]
        subprocess.run([*command, "apt", "install", "--allow-downgrades", str(path)], check=True)
    try:
        send_command("quit")
    except OSError:
        pass
    return str(release.get("tag_name", "unknown"))
