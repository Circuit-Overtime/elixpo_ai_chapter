#!/usr/bin/env sh
# Install the system utility required by Wayland clipboard monitoring.

set -eu

if command -v wl-paste >/dev/null 2>&1; then
    printf 'wl-clipboard is already installed.\n'
    exit 0
fi

if command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
        exec apt-get install wl-clipboard
    fi
    exec sudo apt-get install wl-clipboard
fi

if command -v dnf >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
        exec dnf install wl-clipboard
    fi
    exec sudo dnf install wl-clipboard
fi

if command -v pacman >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
        exec pacman -S wl-clipboard
    fi
    exec sudo pacman -S wl-clipboard
fi

printf 'Install the wl-clipboard package with your system package manager.\n' >&2
exit 1
