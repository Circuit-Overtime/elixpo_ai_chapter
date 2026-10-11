# Win Dot Panel

<p align="center"><img src="../../web/favicon.png" alt="Win Dot Panel panda mascot" width="104"></p>

A quick emoji and clipboard panel for Linux. It has a clean, macOS-inspired look and the familiar Windows emoji picker behavior: choose an emoji, keep the panel open, and choose another.

Built for GNOME and KDE Plasma on Wayland or X11.

## Preview

<p align="center">
  <a href="docs/images/emoji-panel.png"><img src="docs/images/emoji-panel.png" alt="Emoji tab with recent emoji and an eight-column grid" width="310"></a>
  <a href="docs/images/clipboard-panel.png"><img src="docs/images/clipboard-panel.png" alt="Clipboard tab showing example screenshot and text history" width="310"></a>
</p>

The clipboard items shown here are examples.

## What you can do

- Find emoji, kaomoji, and symbols, even without an internet connection.
- Click an emoji, kaomoji, symbol, or text history item to insert it at your previous text cursor. Your clipboard stays unchanged for text insertion.
- Click a screenshot to paste it where you were working. Right-click any history card, or use its **⋯** button, to copy, pin, or remove it.
- Switch between light and dark appearances with your desktop.

Your clipboard history stays on your computer.

## Install

The Debian package is available for Debian 13 and Ubuntu 26.04. Run this once to add the signed APT repository and install Win Dot Panel:

```bash
curl -fsSL -o /var/tmp/win-dot-panel-install.sh https://packages.elixpo.com/win-dot-panel/install.sh && bash /var/tmp/win-dot-panel-install.sh
```

The script checks the APT signing key, adds the repository, and installs the latest stable package. [Manual setup steps](../../docs/apt-repository.md#manual-setup) are available if you prefer to run each command yourself. If `curl` is missing, install it first with `sudo apt install curl`.

The same quick command is on the [Win Dot Panel package page](https://packages.elixpo.com/win-dot-panel/). Standalone packages are available from the [Win Dot Panel releases](https://github.com/elixpo/packages.elixpo/releases?q=win-dot-panel%2Fv). For other Linux distributions, see the [developer guide](docs/development.md).

The installer prints the shortcut commands and adds an app-menu launcher. `/usr/bin/win-dot-panel toggle` opens the panel.

On Wayland, open the panel once and approve the desktop's keyboard and clipboard access dialog. Win Dot Panel stores the restore token locally so future starts can reuse that approval. If you dismiss the dialog, request it again with `/usr/bin/win-dot-panel enable-wayland`.

## Open the panel

Run `/usr/bin/win-dot-panel toggle` to show or hide it. Installation through `sudo apt` starts clipboard history immediately for the current desktop user. The package also starts the background app at future sign-ins, so the panel opens quickly and clipboard history stays available. For an older package, run `/usr/bin/win-dot-panel install` once to enable login startup.

To open it with **Super + .**, add `/usr/bin/win-dot-panel toggle` as a custom keyboard shortcut in your desktop settings. Assign **Super + V** to `/usr/bin/win-dot-panel toggle-clipboard` to open the Clipboard tab directly. Follow the [GNOME or KDE shortcut guide](docs/shortcuts.md) if you need help. The shortcut also starts the app if it is not already running.

If you previously ran the app from a local `.venv`, change your desktop shortcuts to these `/usr/bin` commands and run `/usr/bin/win-dot-panel install` again to refresh its login startup entry.

The panel opens near your pointer. Drag the small handle at the top to move it. Use the tabs to browse or search. Click an item to insert it. Clipboard cards have a **⋯** menu with **Copy to clipboard**, **Pin**, and **Remove**. Press **Esc** to close the panel.

Text insertion uses the desktop accessibility interface when available. On Wayland, the approved desktop portal supplies clipboard data and sends the paste shortcut to the previously focused app. On X11, the package uses `xdotool` as a fallback.

The **Open Source** tab links to the repository, issues, and documentation.

## Update

With the APT repository configured, run:

```bash
sudo apt update
sudo apt install --only-upgrade win-dot-panel
/usr/bin/win-dot-panel quit
```

The last command closes any older background process; the next shortcut press starts the updated app. A message saying the daemon is not running is harmless. Normal system upgrades also include new stable versions.

If you previously installed a `.deb` manually, the setup script also switches you to repository updates. `apt-cache policy win-dot-panel` shows the installed version and the available candidate. For the exact installed Debian version, run `dpkg-query -W -f='${Version}\n' win-dot-panel`.

## Remove

To stop starting at login, run `/usr/bin/win-dot-panel uninstall`. To remove the app, run `sudo apt remove win-dot-panel`. Removing it does not erase your saved clipboard history.

Developing or packaging the app? See the [developer guide](docs/development.md) and [implementation plan](docs/implementation-plan.md).

## License

The app's code is available under the [MIT License](LICENSE). The bundled emoji data retains the [Unicode License v3](src/win_dot_panel/resources/UNICODE-LICENSE.txt).
