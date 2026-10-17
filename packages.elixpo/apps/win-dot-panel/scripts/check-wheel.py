"""Check that a built wheel contains the runtime files and CLI entry point."""

from __future__ import annotations

import argparse
import sys
from email.parser import Parser
from pathlib import Path
from zipfile import BadZipFile, ZipFile

REQUIRED = {
    "win_dot_panel/__init__.py",
    "win_dot_panel/__main__.py",
    "win_dot_panel/cli.py",
    "win_dot_panel/daemon.py",
    "win_dot_panel/desktop/autostart.py",
    "win_dot_panel/resources/emoji.json",
    "win_dot_panel/resources/icon.png",
    "win_dot_panel/resources/UNICODE-LICENSE.txt",
    "win_dot_panel/storage/schema.sql",
    "win_dot_panel/storage/migration_002_emoji_fts.sql",
    "win_dot_panel/storage/migration_003_clipboard_images.sql",
    "win_dot_panel/storage/migration_004_emoji_recents.sql",
    "win_dot_panel/text_picker/data.py",
    "win_dot_panel/ui/popup.py",
}


def check_wheel(path: Path) -> None:
    with ZipFile(path) as wheel:
        names = set(wheel.namelist())
        missing = REQUIRED - names
        if missing:
            raise ValueError(f"Missing runtime files: {', '.join(sorted(missing))}")
        if any(name.startswith("linux_dot_panel/") for name in names):
            raise ValueError("Wheel contains files from the old package name")

        metadata_files = [name for name in names if name.endswith(".dist-info/METADATA")]
        entry_files = [name for name in names if name.endswith(".dist-info/entry_points.txt")]
        if len(metadata_files) != 1 or len(entry_files) != 1:
            raise ValueError("Wheel must have one METADATA and entry_points.txt file")

        metadata = Parser().parsestr(wheel.read(metadata_files[0]).decode("utf-8"))
        if metadata.get("Name", "").lower().replace("_", "-") != "win-dot-panel":
            raise ValueError("Unexpected package name")
        if metadata.get("License-Expression") != "MIT AND Unicode-3.0":
            raise ValueError("Unexpected license expression")
        license_files = set(metadata.get_all("License-File", []))
        required_licenses = {"LICENSE", "src/win_dot_panel/resources/UNICODE-LICENSE.txt"}
        if not required_licenses.issubset(license_files):
            raise ValueError("Wheel license notices are missing")
        dist_info = metadata_files[0].rsplit("/", 1)[0]
        if any(f"{dist_info}/licenses/{path}" not in names for path in required_licenses):
            raise ValueError("Wheel license texts are missing")
        if not any("pyside6" in value.lower() for value in metadata.get_all("Requires-Dist", [])):
            raise ValueError("PySide6 dependency is missing")

        entry_points = wheel.read(entry_files[0]).decode("utf-8")
        if "win-dot-panel = win_dot_panel.cli:main" not in entry_points:
            raise ValueError("win-dot-panel CLI entry point is missing")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wheel", type=Path, help="Path to the built .whl file")
    args = parser.parse_args()
    try:
        check_wheel(args.wheel)
    except (OSError, ValueError, BadZipFile) as error:
        print(f"Wheel check failed: {error}", file=sys.stderr)
        return 1
    print(f"Wheel contents OK: {args.wheel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
