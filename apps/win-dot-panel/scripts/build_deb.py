"""Build a Debian 13 package from a verified, pure Python application wheel."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from email.parser import Parser
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from zipfile import BadZipFile, ZipFile

PACKAGE = "win-dot-panel"
MODULE = "win_dot_panel"
PYTHON_DIR = Path("usr/lib/python3/dist-packages")
DEPENDENCIES = (
    "python3 (>= 3.10), python3-pyside6.qtwidgets (>= 6.6), "
    "python3-pyside6.qtnetwork (>= 6.6), "
    "python3-gi, gir1.2-atspi-2.0, wl-clipboard, xdotool"
)


def _wheel_version(wheel: ZipFile) -> str:
    names = wheel.namelist()
    metadata_files = [name for name in names if name.endswith(".dist-info/METADATA")]
    wheel_files = [name for name in names if name.endswith(".dist-info/WHEEL")]
    if len(metadata_files) != 1 or len(wheel_files) != 1:
        raise ValueError("Expected one wheel metadata directory")
    metadata = Parser().parsestr(wheel.read(metadata_files[0]).decode("utf-8"))
    if metadata.get("Name", "").lower().replace("_", "-") != PACKAGE:
        raise ValueError("Wheel package name does not match win-dot-panel")
    version = metadata.get("Version", "")
    if not re.fullmatch(r"[0-9][A-Za-z0-9.+~]*", version):
        raise ValueError(f"Unsupported Debian package version: {version}")
    wheel_info = wheel.read(wheel_files[0]).decode("utf-8")
    if "Root-Is-Purelib: true" not in wheel_info:
        raise ValueError("Only pure Python wheels are supported")
    return version


def _copy_module(wheel: ZipFile, stage: Path) -> None:
    members = [name for name in wheel.namelist() if name.startswith(f"{MODULE}/")]
    required = {
        f"{MODULE}/__init__.py",
        f"{MODULE}/cli.py",
        f"{MODULE}/resources/emoji.json",
        f"{MODULE}/resources/icon.png",
        f"{MODULE}/resources/UNICODE-LICENSE.txt",
        f"{MODULE}/storage/schema.sql",
    }
    if not required.issubset(members):
        raise ValueError("Wheel is missing required application files")
    for name in members:
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or not name.startswith(f"{MODULE}/"):
            raise ValueError(f"Unsafe wheel member: {name}")
        if name.endswith("/"):
            continue
        if path.suffix in (".so", ".pyd"):
            raise ValueError("Compiled wheels are not supported")
        target = stage / PYTHON_DIR / Path(*path.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(wheel.read(name))


def _write_control(stage: Path, version: str, revision: int) -> None:
    control = stage / "DEBIAN" / "control"
    control.parent.mkdir(parents=True)
    control.write_text(
        f"Package: {PACKAGE}\n"
        f"Version: {version}-{revision}\n"
        "Section: utils\n"
        "Priority: optional\n"
        "Architecture: all\n"
        "Maintainer: Local package builder <local@localhost>\n"
        f"Depends: {DEPENDENCIES}\n"
        "Description: Emoji and clipboard panel for Linux\n"
        " A floating emoji, clipboard, kaomoji, and symbols panel for GNOME and KDE.\n",
        encoding="utf-8",
    )


def _write_copyright(stage: Path, wheel: ZipFile) -> None:
    mit_license = (Path(__file__).resolve().parents[1] / "LICENSE").read_text(encoding="utf-8")
    unicode_license = wheel.read(f"{MODULE}/resources/UNICODE-LICENSE.txt").decode("utf-8")
    copyright_file = stage / "usr/share/doc" / PACKAGE / "copyright"
    copyright_file.parent.mkdir(parents=True, exist_ok=True)
    copyright_file.write_text(
        "Upstream-Name: Win Dot Panel\n"
        "Source: https://github.com/elixpo/packages.elixpo/tree/main/apps/win-dot-panel\n"
        "Upstream-Contact: https://github.com/elixpo/packages.elixpo/issues\n\n"
        "Application code and documentation: MIT License\n\n"
        f"{mit_license.rstrip()}\n\n"
        "Bundled emoji data: Unicode License v3\n\n"
        f"{unicode_license.rstrip()}\n",
        encoding="utf-8",
    )


def _write_desktop_integration(stage: Path, wheel: ZipFile) -> None:
    launcher = stage / "usr/share/applications" / f"{PACKAGE}.desktop"
    launcher.parent.mkdir(parents=True, exist_ok=True)
    launcher.write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=Win Dot Panel\n"
        "Comment=Emoji and clipboard panel\n"
        "Exec=/usr/bin/win-dot-panel toggle\n"
        "TryExec=/usr/bin/win-dot-panel\n"
        "Icon=win-dot-panel\n"
        "Terminal=false\n"
        "StartupNotify=false\n"
        "Categories=Utility;\n"
        "Keywords=Emoji;Clipboard;Kaomoji;Symbols;\n",
        encoding="utf-8",
    )
    icon = stage / "usr/share/icons/hicolor/512x512/apps" / f"{PACKAGE}.png"
    icon.parent.mkdir(parents=True, exist_ok=True)
    icon.write_bytes(wheel.read(f"{MODULE}/resources/icon.png"))
    autostart = stage / "etc/xdg/autostart" / f"{PACKAGE}.desktop"
    autostart.parent.mkdir(parents=True, exist_ok=True)
    autostart.write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Name=Win Dot Panel\n"
        "Comment=Keep the emoji and clipboard panel ready\n"
        "Exec=/usr/bin/win-dot-panel daemon\n"
        "TryExec=/usr/bin/win-dot-panel\n"
        "Terminal=false\n"
        "NoDisplay=true\n"
        "X-GNOME-Autostart-enabled=true\n",
        encoding="utf-8",
    )


def _write_postinst(stage: Path) -> None:
    postinst = stage / "DEBIAN" / "postinst"
    postinst.write_text(
        "#!/bin/sh\n"
        "set -e\n"
        'if [ "$1" = configure ]; then\n'
        '    install_uid="${SUDO_UID:-${PKEXEC_UID:-}}"\n'
        '    case "$install_uid" in\n'
        "        ''|*[!0-9]*|0) started=false ;;\n"
        "        *)\n"
        '            install_user=$(getent passwd "$install_uid" | cut -d: -f1)\n'
        '            runtime_dir="/run/user/$install_uid"\n'
        '            if [ -n "$install_user" ] && [ -d "$runtime_dir" ]; then\n'
        '                if runuser -u "$install_user" -- env \\\n'
        '                    XDG_RUNTIME_DIR="$runtime_dir" \\\n'
        '                    DBUS_SESSION_BUS_ADDRESS="unix:path=$runtime_dir/bus" \\\n'
        "                    /usr/bin/win-dot-panel quit >/dev/null 2>&1; then\n"
        "                    sleep 1\n"
        "                fi\n"
        '                if runuser -u "$install_user" -- env \\\n'
        '                    XDG_RUNTIME_DIR="$runtime_dir" \\\n'
        '                    DBUS_SESSION_BUS_ADDRESS="unix:path=$runtime_dir/bus" \\\n'
        "                    /usr/bin/win-dot-panel start >/dev/null 2>&1; then\n"
        "                    started=true\n"
        "                else\n"
        "                    started=false\n"
        "                fi\n"
        "            else\n"
        "                started=false\n"
        "            fi\n"
        "            ;;\n"
        "    esac\n"
        "    cat <<'HELP'\n"
        "\n"
        "Win Dot Panel is installed. Set these desktop keyboard shortcuts:\n"
        "  Super + .  ->  /usr/bin/win-dot-panel toggle\n"
        "  Super + V  ->  /usr/bin/win-dot-panel toggle-clipboard\n"
        "\n"
        "Open Win Dot Panel from your app menu, or run /usr/bin/win-dot-panel toggle.\n"
        "Shortcut help: https://packages.elixpo.com/win-dot-panel/#shortcuts\n"
        "On Wayland, approve the desktop keyboard and clipboard dialog when the panel first opens.\n"
        "You can request it again with: /usr/bin/win-dot-panel enable-wayland\n"
        "\n"
        "HELP\n"
        '    if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then\n'
        "        green=$(printf '\\033[1;32m')\n"
        "        soft_green=$(printf '\\033[0;32m')\n"
        "        reset=$(printf '\\033[0m')\n"
        "    else\n"
        '        green=""\n'
        '        soft_green=""\n'
        '        reset=""\n'
        "    fi\n"
        '    printf "%s✓ Win Dot Panel installed — your clipboard, one shortcut away.%s\\n" "$green" "$reset"\n'
        '    if [ "$started" = true ]; then\n'
        '        printf "%sClipboard history is running for %s.%s\\n" "$soft_green" "$install_user" "$reset"\n'
        "    else\n"
        '        printf "%sLog out and log back in once to activate clipboard history.%s\\n" "$soft_green" "$reset"\n'
        "    fi\n"
        '    printf "%sIf clipboard history stays empty, log out and log back in once.%s\\n" "$soft_green" "$reset"\n'
        "fi\n"
        "exit 0\n",
        encoding="utf-8",
    )


def _set_package_modes(stage: Path) -> None:
    stage.chmod(0o755)
    for path in stage.rglob("*"):
        path.chmod(0o755 if path.is_dir() else 0o644)
    (stage / "usr/bin" / PACKAGE).chmod(0o755)
    (stage / "DEBIAN" / "postinst").chmod(0o755)


def build_deb(
    wheel_path: Path, output_dir: Path, *, revision: int = 1, snapshot_run: int | None = None
) -> Path:
    if revision < 1:
        raise ValueError("Debian revision must be positive")
    if snapshot_run is not None and snapshot_run < 1:
        raise ValueError("Snapshot run must be positive")
    with ZipFile(wheel_path) as wheel:
        version = _wheel_version(wheel)
        if snapshot_run is not None:
            version = f"{version}~main.{snapshot_run}"
        destination = output_dir / f"{PACKAGE}_{version}-{revision}_all.deb"
        output_dir.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(prefix="win-dot-panel-deb-") as temporary:
            stage = Path(temporary)
            _copy_module(wheel, stage)
            launcher = stage / "usr/bin" / PACKAGE
            launcher.parent.mkdir(parents=True, exist_ok=True)
            launcher.write_text(
                "#!/usr/bin/python3\n"
                "from win_dot_panel.cli import main\n"
                "raise SystemExit(main())\n",
                encoding="utf-8",
            )
            _write_control(stage, version, revision)
            _write_copyright(stage, wheel)
            _write_desktop_integration(stage, wheel)
            _write_postinst(stage)
            _set_package_modes(stage)
            subprocess.run(
                ["dpkg-deb", "--build", "--root-owner-group", str(stage), str(destination)],
                check=True,
            )
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wheel", type=Path, help="Verified win-dot-panel .whl file")
    parser.add_argument("--output-dir", type=Path, default=Path("dist"))
    parser.add_argument("--revision", type=int, default=1, help="Debian package revision")
    parser.add_argument("--snapshot-run", type=int, help="Main branch workflow run number")
    args = parser.parse_args()
    try:
        path = build_deb(
            args.wheel, args.output_dir, revision=args.revision, snapshot_run=args.snapshot_run
        )
    except (OSError, ValueError, BadZipFile, subprocess.CalledProcessError) as error:
        print(f"Debian package build failed: {error}", file=sys.stderr)
        return 1
    print(f"Built {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
