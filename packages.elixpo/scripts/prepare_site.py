"""Assemble the static catalogue, installers, and legacy public assets."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

PRODUCTS = {
    "win-dot-panel": "Win Dot Panel",
    "screenbridge": "ScreenBridge",
    "crumb": "Crumb",
}


def prepare_site(source: Path, destination: Path) -> None:
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")
    shutil.copytree(source, destination)

    template = Path("web/install.sh.in").read_text(encoding="utf-8")
    (destination / "install.sh.in").unlink(missing_ok=True)

    # These stable URLs predate the application frontend and remain part of
    # the public package contract. The Next.js site references them directly.
    for relative in (
        "favicon.ico",
        "favicon.png",
        "info.css",
        "og-image.png",
        "screenbridge/icon.svg",
    ):
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(Path("web") / relative, target)

    for package, display_name in PRODUCTS.items():
        rendered = template.replace("@PACKAGE@", package).replace("@DISPLAY_NAME@", display_name)
        installer = destination / package / "install.sh"
        installer.parent.mkdir(parents=True, exist_ok=True)
        installer.write_text(rendered, encoding="utf-8")
        installer.chmod(0o755)

    # Keep the original public installer URL working for existing users.
    shutil.copy2(destination / "win-dot-panel/install.sh", destination / "install.sh")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source", type=Path, default=Path("out"))
    args = parser.parse_args()
    prepare_site(args.source, args.destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
