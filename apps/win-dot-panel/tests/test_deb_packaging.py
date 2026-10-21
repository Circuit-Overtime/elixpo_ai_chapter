from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile

import pytest


def test_deb_contains_launcher_data_and_dependencies(tmp_path):
    if shutil.which("dpkg-deb") is None:
        pytest.skip("dpkg-deb is unavailable")
    wheel = tmp_path / "win_dot_panel-1.0.0-py3-none-any.whl"
    icon = (
        Path(__file__).resolve().parents[1] / "src" / "win_dot_panel" / "resources" / "icon.png"
    ).read_bytes()
    with ZipFile(wheel, "w") as archive:
        for name in (
            "win_dot_panel/__init__.py",
            "win_dot_panel/cli.py",
            "win_dot_panel/desktop/wayland_portal.py",
            "win_dot_panel/resources/emoji.json",
            "win_dot_panel/resources/icon.png",
            "win_dot_panel/resources/UNICODE-LICENSE.txt",
            "win_dot_panel/storage/schema.sql",
        ):
            if name.endswith("icon.png"):
                archive.writestr(name, icon)
            else:
                archive.writestr(
                    name,
                    "UNICODE LICENSE V3\nCopyright Unicode, Inc.\n"
                    if name.endswith("UNICODE-LICENSE.txt")
                    else "",
                )
        archive.writestr(
            "win_dot_panel-1.0.0.dist-info/METADATA",
            "Metadata-Version: 2.1\nName: win-dot-panel\nVersion: 1.0.0\n",
        )
        archive.writestr("win_dot_panel-1.0.0.dist-info/WHEEL", "Root-Is-Purelib: true\n")

    script = Path(__file__).resolve().parents[1] / "scripts" / "build_deb.py"
    subprocess.run(
        [
            sys.executable,
            str(script),
            str(wheel),
            "--output-dir",
            str(tmp_path),
            "--revision",
            "2",
        ],
        check=True,
    )
    package = tmp_path / "win-dot-panel_1.0.0-2_all.deb"
    contents = subprocess.check_output(["dpkg-deb", "--contents", str(package)], text=True)
    depends = subprocess.check_output(["dpkg-deb", "--field", str(package), "Depends"], text=True)
    assert "./usr/bin/win-dot-panel" in contents
    assert "./usr/lib/python3/dist-packages/win_dot_panel/resources/emoji.json" in contents
    assert "./usr/lib/python3/dist-packages/win_dot_panel/desktop/wayland_portal.py" in contents
    assert "./usr/share/doc/win-dot-panel/copyright" in contents
    assert "./usr/share/applications/win-dot-panel.desktop" in contents
    assert "./etc/xdg/autostart/win-dot-panel.desktop" in contents
    assert "./usr/share/icons/hicolor/512x512/apps/win-dot-panel.png" in contents
    assert "drwxr-xr-x root/root" in contents
    assert "-rwxr-xr-x root/root" in contents
    assert "wl-clipboard" in depends
    assert "xdotool" in depends
    assert "python3-gi" in depends
    assert "python3-pyside6.qtwidgets" in depends
    assert "python3-pyside6.qtnetwork" in depends
    unpacked = tmp_path / "unpacked"
    subprocess.run(["dpkg-deb", "--extract", str(package), str(unpacked)], check=True)
    copyright_text = (unpacked / "usr/share/doc/win-dot-panel/copyright").read_text()
    assert "MIT License" in copyright_text
    assert "UNICODE LICENSE V3\nCopyright Unicode, Inc." in copyright_text
    desktop = (unpacked / "usr/share/applications/win-dot-panel.desktop").read_text()
    assert "Exec=/usr/bin/win-dot-panel toggle\n" in desktop
    assert "Icon=win-dot-panel\n" in desktop
    autostart = (unpacked / "etc/xdg/autostart/win-dot-panel.desktop").read_text()
    assert "Exec=/usr/bin/win-dot-panel daemon\n" in autostart
    assert (
        unpacked / "usr/share/icons/hicolor/512x512/apps/win-dot-panel.png"
    ).read_bytes() == icon

    control = tmp_path / "control"
    subprocess.run(["dpkg-deb", "--control", str(package), str(control)], check=True)
    postinst = control / "postinst"
    assert postinst.stat().st_mode & 0o111
    message = subprocess.check_output([str(postinst), "configure"], text=True)
    assert "Super + .  ->  /usr/bin/win-dot-panel toggle" in message
    assert "Super + V  ->  /usr/bin/win-dot-panel toggle-clipboard" in message
    assert "https://packages.elixpo.com/win-dot-panel/#shortcuts" in message
    assert "Win Dot Panel installed — your clipboard, one shortcut away" in message
    assert "Log out and log back in once to activate clipboard history" in message
    assert "If clipboard history stays empty, log out and log back in once" in message
    assert "approve the desktop keyboard and clipboard dialog" in message
    assert "/usr/bin/win-dot-panel enable-wayland" in message
    postinst_text = postinst.read_text()
    assert "/usr/bin/win-dot-panel quit" in postinst_text
    assert "/usr/bin/win-dot-panel start" in postinst_text
    assert 'install_uid="${SUDO_UID:-${PKEXEC_UID:-}}"' in postinst_text

    subprocess.run(
        [
            sys.executable,
            str(script),
            str(wheel),
            "--output-dir",
            str(tmp_path),
            "--snapshot-run",
            "42",
        ],
        check=True,
    )
    snapshot = tmp_path / "win-dot-panel_1.0.0~main.42-1_all.deb"
    assert snapshot.exists()
    version = subprocess.check_output(["dpkg-deb", "--field", str(snapshot), "Version"], text=True)
    assert version.strip() == "1.0.0~main.42-1"
