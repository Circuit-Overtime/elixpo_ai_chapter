from __future__ import annotations

import hashlib
from types import SimpleNamespace

import pytest

from win_dot_panel import updater


def test_stable_release_is_selected_by_product_prefix(monkeypatch):
    releases = [
        {
            "tag_name": "screenbridge/v1.0.0-2",
            "draft": False,
            "prerelease": False,
            "published_at": "2026-10-09T12:00:00Z",
            "assets": [],
        },
        {
            "tag_name": "win-dot-panel/v1.0.0-10",
            "draft": False,
            "prerelease": False,
            "published_at": "2026-10-09T11:00:00Z",
            "assets": [],
        },
    ]
    monkeypatch.setattr(
        updater, "_read_url", lambda _url: __import__("json").dumps(releases).encode()
    )

    assert updater._release("stable")["tag_name"] == "win-dot-panel/v1.0.0-10"


def test_snapshot_checksum_accepts_githubs_renamed_asset():
    package = "win-dot-panel_1.0.0.main.9-1_all.deb"
    digest = "a" * 64
    checksums = f"{digest}  win-dot-panel_1.0.0~main.9-1_all.deb\n".encode()
    assert updater._expected_hash(checksums, package) == digest


def test_updater_verifies_package_before_apt(tmp_path, monkeypatch):
    package = b"Debian package contents"
    package_name = "win-dot-panel_1.0.0-1_all.deb"
    release = {
        "tag_name": "v1.0.0-1",
        "assets": [
            {"name": package_name, "browser_download_url": "https://example.test/package"},
            {"name": "SHA256SUMS", "browser_download_url": "https://example.test/checksums"},
        ],
    }
    digest = hashlib.sha256(package).hexdigest()
    downloads = {
        "https://example.test/package": package,
        "https://example.test/checksums": f"{digest}  {package_name}\n".encode(),
    }
    monkeypatch.setattr(updater, "_release", lambda channel: release)
    monkeypatch.setattr(updater, "_read_url", downloads.__getitem__)
    monkeypatch.setattr(updater.os, "geteuid", lambda: 1000)
    stopped: list[str] = []
    monkeypatch.setattr(updater, "send_command", stopped.append)

    class TemporaryDirectory:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return str(tmp_path)

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(updater.tempfile, "TemporaryDirectory", TemporaryDirectory)
    commands: list[list[str]] = []

    def run(command, **_kwargs):
        commands.append(command)
        if command[0] == "dpkg-deb":
            return SimpleNamespace(stdout="win-dot-panel\n")
        return SimpleNamespace()

    monkeypatch.setattr(updater.subprocess, "run", run)
    assert updater.update() == "v1.0.0-1"
    assert commands[0][:2] == ["dpkg-deb", "--field"]
    assert commands[1][:4] == ["sudo", "apt", "install", "--allow-downgrades"]
    assert stopped == ["quit"]

    downloads["https://example.test/package"] = b"tampered"
    commands.clear()
    with pytest.raises(ValueError, match="SHA-256"):
        updater.update()
    assert commands == []
