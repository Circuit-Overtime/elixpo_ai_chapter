from __future__ import annotations

import subprocess

import pytest

from win_dot_panel.desktop import autostart


def test_xdg_install_and_uninstall_uses_current_python(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    python = tmp_path / "venv with spaces" / "bin" / "python"
    monkeypatch.setattr(autostart.sys, "executable", str(python))

    path = autostart.install()
    content = path.read_text(encoding="utf-8")
    assert path == tmp_path / "autostart" / "win-dot-panel.desktop"
    assert f'Exec="{python}" -m win_dot_panel daemon' in content
    assert "Terminal=false" in content
    assert autostart.uninstall() == [path]
    assert not path.exists()


def test_install_does_not_replace_unmanaged_file(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    path = tmp_path / "autostart" / "win-dot-panel.desktop"
    path.parent.mkdir(parents=True)
    path.write_text("[Desktop Entry]\nName=Custom\n", encoding="utf-8")

    with pytest.raises(FileExistsError):
        autostart.install()
    assert "Name=Custom" in path.read_text(encoding="utf-8")
    assert autostart.uninstall() == []
    assert path.exists()


def test_systemd_install_and_uninstall(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
    calls = []

    def run(args, *, check):
        assert check
        calls.append(args)
        return subprocess.CompletedProcess(args, 0)

    monkeypatch.setattr(autostart.subprocess, "run", run)
    path = autostart.install("systemd")
    content = path.read_text(encoding="utf-8")
    assert "WantedBy=graphical-session.target" in content
    assert " -m win_dot_panel daemon" in content
    assert calls == [
        ["systemctl", "--user", "daemon-reload"],
        ["systemctl", "--user", "enable", "win-dot-panel.service"],
    ]
    assert autostart.uninstall() == [path]
    assert not path.exists()
    assert calls[-2:] == [
        ["systemctl", "--user", "disable", "--now", "win-dot-panel.service"],
        ["systemctl", "--user", "daemon-reload"],
    ]
