from __future__ import annotations

import os
import socket
import sqlite3
import subprocess
import sys
import time

import pytest
from PySide6.QtCore import QBuffer, QIODevice
from PySide6.QtGui import QColor, QImage

from win_dot_panel.ipc.client import send_command
from win_dot_panel.ipc.protocol import decode_message, encode_message


def test_ipc_message_round_trip():
    payload = {"command": "toggle"}
    assert decode_message(encode_message(payload)) == payload


def test_cli_reaches_daemon_over_unix_socket(tmp_path, monkeypatch):
    runtime = tmp_path / "runtime"
    runtime.mkdir(mode=0o700)
    with socket.socket(socket.AF_UNIX) as probe:
        try:
            probe.bind(str(runtime / "probe.sock"))
        except PermissionError:
            pytest.skip("This environment does not permit Unix socket binding")
    env = dict(
        os.environ,
        XDG_RUNTIME_DIR=str(runtime),
        XDG_STATE_HOME=str(tmp_path / "state"),
        XDG_CONFIG_HOME=str(tmp_path / "config"),
        XDG_DATA_HOME=str(tmp_path / "data"),
        QT_QPA_PLATFORM="offscreen",
    )
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(runtime))
    command = [sys.executable, "-m", "win_dot_panel"]
    daemon = subprocess.Popen([*command, "daemon"], env=env)

    def cli(action: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [*command, action], env=env, capture_output=True, text=True, timeout=5, check=False
        )

    try:
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            status = cli("status")
            if status.returncode == 0:
                break
            if daemon.poll() is not None:
                raise AssertionError(f"Daemon exited with {daemon.returncode}")
            time.sleep(0.05)
        else:
            raise AssertionError("Daemon did not create its socket")

        assert cli("show").returncode == 0
        assert send_command("status")["visible"] is True
        assert cli("toggle-clipboard").returncode == 0
        assert send_command("status")["visible"] is False
        assert cli("toggle-clipboard").returncode == 0
        assert send_command("status")["tab"] == "Clipboard"
        assert send_command("status")["visible"] is True
        assert cli("toggle").returncode == 0
        assert send_command("status")["visible"] is False

        for action in ("show", "hide", "toggle", "quit"):
            if action == "quit":
                for value in (b"copied from browser", b"copied from browser"):
                    event = subprocess.run(
                        [*command[:2], "win_dot_panel.clipboard.watch_event"],
                        input=value,
                        env=dict(env, CLIPBOARD_STATE="data"),
                        capture_output=True,
                        timeout=5,
                        check=False,
                    )
                    assert event.returncode == 0, event.stderr
                sensitive = subprocess.run(
                    [*command[:2], "win_dot_panel.clipboard.watch_event"],
                    input=b"password",
                    env=dict(env, CLIPBOARD_STATE="sensitive"),
                    capture_output=True,
                    timeout=5,
                    check=False,
                )
                assert sensitive.returncode == 0
                image = QImage(3, 3, QImage.Format.Format_ARGB32)
                image.fill(QColor("green"))
                buffer = QBuffer()
                buffer.open(QIODevice.OpenModeFlag.WriteOnly)
                assert image.save(buffer, "PNG")
                screenshot = subprocess.run(
                    [*command[:2], "win_dot_panel.clipboard.watch_event"],
                    input=bytes(buffer.data()),
                    env=dict(env, CLIPBOARD_STATE="data", CLIPBOARD_TYPE="image/png"),
                    capture_output=True,
                    timeout=5,
                    check=False,
                )
                assert screenshot.returncode == 0, screenshot.stderr
            result = cli(action)
            assert result.returncode == 0, (action, result.stderr)
        assert daemon.wait(timeout=3) == 0
        assert (tmp_path / "data" / "win-dot-panel" / "panel.db").is_file()
        with sqlite3.connect(tmp_path / "data" / "win-dot-panel" / "panel.db") as connection:
            assert connection.execute(
                "SELECT text_content, use_count FROM clipboard_items WHERE content_type = 'text'"
            ).fetchall() == [("copied from browser", 2)]
            assert (
                connection.execute(
                    "SELECT count(*) FROM clipboard_items WHERE content_type = 'image' "
                    "AND length(image_content) > 0"
                ).fetchone()[0]
                == 1
            )

        # A shortcut must also work when the daemon was not already running.
        result = cli("toggle")
        assert result.returncode == 0, result.stderr
        assert cli("status").returncode == 0
        assert cli("quit").returncode == 0
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and cli("status").returncode == 0:
            time.sleep(0.05)
        result = cli("toggle-clipboard")
        assert result.returncode == 0, result.stderr
        assert send_command("status")["tab"] == "Clipboard"
        assert cli("quit").returncode == 0
    finally:
        if daemon.poll() is None:
            daemon.terminate()
            daemon.wait(timeout=3)
        if cli("status").returncode == 0:
            cli("quit")
