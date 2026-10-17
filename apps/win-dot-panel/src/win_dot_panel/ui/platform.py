"""Select a Qt backend that can place the popup near the pointer."""

from __future__ import annotations

import os


def configure_window_platform() -> None:
    # Native Wayland does not permit clients to position ordinary top-level windows.
    # XWayland can position this floating panel while clipboard capture still uses Wayland.
    if (
        os.environ.get("XDG_SESSION_TYPE") == "wayland"
        and os.environ.get("DISPLAY")
        and not os.environ.get("QT_QPA_PLATFORM")
    ):
        os.environ["QT_QPA_PLATFORM"] = "xcb;wayland"
