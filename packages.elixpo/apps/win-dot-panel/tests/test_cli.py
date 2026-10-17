from __future__ import annotations

import subprocess

import pytest

from win_dot_panel import __version__, cli


def test_version_option_prints_source_version(capsys):
    with pytest.raises(SystemExit) as result:
        cli.main(["--version"])

    assert result.value.code == 0
    assert capsys.readouterr().out == f"win-dot-panel {__version__}\n"


def test_system_package_version_includes_debian_revision(monkeypatch, capsys):
    monkeypatch.setattr(cli, "__file__", "/usr/lib/python3/dist-packages/win_dot_panel/cli.py")

    def dpkg_query(command, **_kwargs):
        assert command == ["dpkg-query", "-W", "-f=${Version}", "win-dot-panel"]
        return subprocess.CompletedProcess(command, 0, "1.0.0-1")

    monkeypatch.setattr(cli.subprocess, "run", dpkg_query)

    with pytest.raises(SystemExit) as result:
        cli.main(["--version"])

    assert result.value.code == 0
    assert capsys.readouterr().out == "win-dot-panel 1.0.0-1\n"


def test_start_is_idempotent_when_daemon_is_running(monkeypatch):
    commands = []
    monkeypatch.setattr(cli, "send_command", lambda command, **kwargs: commands.append(command))
    monkeypatch.setattr(cli, "_start_daemon", lambda: pytest.fail("daemon was restarted"))

    assert cli.main(["start"]) == 0
    assert commands == ["status"]


def test_start_launches_daemon_when_stopped(monkeypatch):
    monkeypatch.setattr(
        cli, "send_command", lambda command, **kwargs: (_ for _ in ()).throw(OSError())
    )
    started = []
    monkeypatch.setattr(cli, "_start_daemon", lambda: started.append(True))

    assert cli.main(["start"]) == 0
    assert started == [True]


def test_enable_wayland_requests_permission(monkeypatch, capsys):
    commands = []
    monkeypatch.setattr(
        cli, "send_command", lambda command, **kwargs: commands.append(command) or {"ok": True}
    )

    assert cli.main(["enable-wayland"]) == 0
    assert commands == ["enable-wayland"]
    assert "Approve the keyboard and clipboard access dialog" in capsys.readouterr().out
