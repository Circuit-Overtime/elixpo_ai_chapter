"""Command line entry point."""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError

from win_dot_panel import __version__
from win_dot_panel.ipc.client import send_command


def _installed_version() -> str:
    """Include the Debian revision when this module came from the system package."""
    package_path = Path("/usr/lib/python3/dist-packages/win_dot_panel")
    if not Path(__file__).resolve().is_relative_to(package_path):
        return __version__
    try:
        result = subprocess.run(
            ["dpkg-query", "-W", "-f=${Version}", "win-dot-panel"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return __version__
    version = result.stdout.strip()
    return version if result.returncode == 0 and version.startswith(__version__) else __version__


class _VersionAction(argparse.Action):
    def __call__(
        self,
        parser: argparse.ArgumentParser,
        _namespace: argparse.Namespace,
        _values: object,
        _option_string: str | None = None,
    ) -> None:
        print(f"{parser.prog} {_installed_version()}")
        parser.exit()


def _start_daemon() -> None:
    process = subprocess.Popen(
        [sys.executable, "-m", "win_dot_panel", "daemon"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        try:
            send_command("status", timeout=0.1)
            return
        except OSError:
            if process.poll() not in (None, 0):
                raise RuntimeError(
                    "Daemon exited during startup; run `win-dot-panel daemon` for details"
                ) from None
            time.sleep(0.05)
    raise RuntimeError(
        "Daemon did not start within 3 seconds; run `win-dot-panel daemon` for details"
    )


def _run_command(command: str) -> int:
    if command == "start":
        try:
            send_command("status", timeout=0.1)
        except OSError:
            try:
                _start_daemon()
            except (OSError, RuntimeError) as error:
                print(error, file=sys.stderr)
                return 1
        return 0
    if command in ("enable-wayland", "toggle", "toggle-clipboard"):
        try:
            response = send_command(command)
        except OSError:
            try:
                _start_daemon()
                response = send_command(command, timeout=3.0)
            except (OSError, RuntimeError) as error:
                print(error, file=sys.stderr)
                return 1
    else:
        try:
            response = send_command(command)
        except OSError:
            if command == "status":
                print("stopped")
                return 1
            print("Daemon is not running", file=sys.stderr)
            return 1

    if not response["ok"]:
        print(response.get("error", "Daemon rejected command"), file=sys.stderr)
        return 1
    if command == "status":
        print("running")
    elif command == "enable-wayland":
        print("Approve the keyboard and clipboard access dialog to finish setup.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="win-dot-panel",
        description="Emoji and clipboard panel for Linux",
    )
    parser.add_argument(
        "--version", action=_VersionAction, nargs=0, help="Show installed version and exit"
    )
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("demo", help="Open the popup prototype")
    commands.add_parser("daemon", help="Run the background daemon")
    commands.add_parser("start", help="Start the background daemon if needed")
    install_command = commands.add_parser("install", help="Start the daemon on login")
    install_command.add_argument(
        "--method", choices=("xdg", "systemd"), default="xdg", help="Session startup method"
    )
    commands.add_parser("uninstall", help="Remove session autostart")
    update_command = commands.add_parser("update", help="Update the installed Debian package")
    update_command.add_argument("--channel", choices=("stable", "main"), default="stable")
    commands.add_parser("toggle-clipboard", help="Open Clipboard or close it if already open")
    commands.add_parser(
        "enable-wayland", help="Request one-time Wayland keyboard and clipboard permission"
    )
    for command in ("toggle", "show", "hide", "status", "quit"):
        commands.add_parser(command, help=f"Send {command} to the daemon")
    args = parser.parse_args(argv)

    if args.command == "demo":
        from win_dot_panel.app import run_demo

        return run_demo()
    if args.command == "daemon":
        from win_dot_panel.daemon import run_daemon

        return run_daemon()
    if args.command in ("install", "uninstall"):
        from win_dot_panel.desktop.autostart import install, uninstall

        try:
            if args.command == "install":
                print(f"Autostart installed: {install(args.method)}")
            else:
                removed = uninstall()
                print("Autostart removed" if removed else "Autostart was not installed")
        except (OSError, ValueError) as error:
            print(error, file=sys.stderr)
            return 1
        return 0
    if args.command == "update":
        from win_dot_panel.updater import update

        try:
            tag = update(args.channel)
        except (
            OSError,
            TypeError,
            ValueError,
            UnicodeError,
            URLError,
            subprocess.CalledProcessError,
        ) as error:
            print(f"Update failed: {error}", file=sys.stderr)
            return 1
        print(f"Installed {tag}. The next shortcut press will start the updated app.")
        return 0
    if args.command in (
        "start",
        "enable-wayland",
        "toggle",
        "toggle-clipboard",
        "show",
        "hide",
        "status",
        "quit",
    ):
        return _run_command(args.command)

    parser.print_help()
    return 0
