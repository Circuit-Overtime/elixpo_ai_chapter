#!/usr/bin/env python3
"""Render Oreo source art for the crumb-ui terminal assets."""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass


RESET = "\033[0m"
BOLD = "\033[1m"
BOLD_OFF = "\033[22m"
SUNGLASSES_ART = (
    " ╭▄█▄╮   ╭▄█▄╮",
    "╭╯███╰───╯███╰╮",
    "╭╯ ▛▀▀▜═▛▀▀▜ ╰╮",
    "│  ████ ████  │",
    "│ ░▒▓     ▓▒░ │",
    "╰╮   ▆▃▂▃▆   ╭╯",
    " ╰───────────╯",
)

AWAKE_ART = (
    " ╭▄█▄╮   ╭▄█▄╮",
    "╭╯███╰───╯███╰╮",
    "╭╯ ▛▀▀▜ ▛▀▀▜ ╰╮",
    "│    ●    ●   │",
    "│ ░▒▓     ▓▒░ │",
    "╰╮   ▆▃▂▃▆   ╭╯",
    " ╰───────────╯",
)

CLOSING_ART = (
    " ╭───╮   ╭───╮",
    "╭╯   ╰───╯  ╰╮",
    "╭╯ ▛▀▀▜═▛▀▀▜ ╰╮",
    "│  ████ ████  │",
    "│ ░▒▓     ▓▒░ │",
    "╰╮   ▆▃▂▃▆   ╭╯",
    " ╰───────────╯",
)

STATES = {
    "cool": SUNGLASSES_ART,
    "awake": AWAKE_ART,
    "closing": CLOSING_ART,
}


@dataclass(frozen=True)
class Color:
    red: int
    green: int
    blue: int


# Terminal-safe samples of the cream, charcoal, and coral favicon palette.
OUTLINE = Color(255, 253, 241)
EYE_PATCH = Color(96, 80, 122)
EYE_TOP = Color(151, 119, 188)
EYE_MID = Color(119, 93, 154)
EYE_BOTTOM = Color(76, 61, 99)
OPEN_EYE = Color(157, 128, 193)
BLUSH_LIGHT = Color(255, 190, 195)
BLUSH_MID = Color(255, 125, 139)
BLUSH_DEEP = Color(255, 88, 110)
SMILE = Color(255, 154, 171)


def foreground(color: Color) -> str:
    return f"\033[38;2;{color.red};{color.green};{color.blue}m"


def character_color(character: str) -> Color | None:
    if character in "╭╮╯╰─│":
        return OUTLINE
    if character in "█═":
        return EYE_PATCH
    if character in "▛▀▜":
        return EYE_TOP
    if character in "▌▐":
        return EYE_MID
    if character in "▙▄▟":
        return EYE_BOTTOM
    if character == "●":
        return OPEN_EYE
    if character == "░":
        return BLUSH_LIGHT
    if character == "▒":
        return BLUSH_MID
    if character == "▓":
        return BLUSH_DEEP
    if character in "▆▃▂":
        return SMILE
    return None


def render(art: tuple[str, ...], color: bool) -> str:
    """Render one mascot state with optional true-color ANSI styling."""
    if not color:
        return "\n".join(art)

    rows: list[str] = []
    for line in art:
        cells: list[str] = []
        active: Color | None = None
        for character in line:
            selected = character_color(character)
            if selected != active:
                cells.append(RESET if selected is None else foreground(selected))
                active = selected
            if character == "●":
                cells.append(BOLD)
            cells.append(character)
            if character == "●":
                cells.append(BOLD_OFF)
        cells.append(RESET)
        rows.append("".join(cells))
    return "\n".join(rows)


def animate(color: bool, initial: str, interval: float) -> None:
    """Flip sunglasses in place until interrupted by the user."""
    names = (initial, "awake" if initial == "cool" else "cool")
    first_frame = True
    frame_index = 0
    try:
        while True:
            art = STATES[names[frame_index % len(names)]]
            if not first_frame:
                sys.stdout.write(f"\033[{len(art)}A")
            for line in render(art, color).splitlines():
                sys.stdout.write(f"\033[2K\r{line}\n")
            sys.stdout.flush()
            first_frame = False
            frame_index += 1
            time.sleep(interval)
    except KeyboardInterrupt:
        sys.stdout.write(RESET)
        sys.stdout.flush()


def use_color(mode: str) -> bool:
    if mode == "always":
        return True
    if mode == "never" or os.environ.get("NO_COLOR") is not None:
        return False
    return sys.stdout.isatty()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--color",
        choices=("auto", "always", "never"),
        default="auto",
        help="ANSI color policy (default: auto)",
    )
    parser.add_argument(
        "--state",
        choices=tuple(STATES),
        default=os.environ.get("CRUMB_MOOD", "cool"),
        help="mascot mood (default: cool, or CRUMB_MOOD)",
    )
    parser.add_argument(
        "--animate",
        action="store_true",
        help="alternate sunglasses on and off until Ctrl+C",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.8,
        help="seconds between animation frames (default: 0.8)",
    )
    args = parser.parse_args()
    color = use_color(args.color)
    if args.animate and sys.stdout.isatty():
        animate(color, args.state, max(0.1, args.interval))
    else:
        print(render(STATES[args.state], color))


if __name__ == "__main__":
    main()
