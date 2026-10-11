# Development and packaging

This guide is for contributors and packagers. The [README](../README.md) covers installation and everyday use.

## Run from a checkout

Install the Wayland clipboard dependency, create a Python environment, and install the project:

```bash
sh scripts/install-system-deps.sh
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
win-dot-panel demo
```

`--system-site-packages` lets the environment use the system's `gi` module for direct text insertion. On Ubuntu, `python3-gi` and `gir1.2-atspi-2.0` supply the required components. Without them, text insertion is unavailable and the panel leaves the clipboard unchanged. Restart the daemon after changing its Python environment.

Useful commands are `win-dot-panel toggle`, `win-dot-panel status`, `win-dot-panel quit`, and `win-dot-panel daemon` for foreground troubleshooting. `win-dot-panel install` adds XDG autostart for the current interpreter; `win-dot-panel uninstall` removes it. `win-dot-panel install --method systemd` is an alternative user service. Uninstall the current startup method before switching.

The database is stored at `$XDG_DATA_HOME/win-dot-panel/panel.db`, or `~/.local/share/win-dot-panel/panel.db`. Settings are stored under `$XDG_CONFIG_HOME/win-dot-panel`, or `~/.config/win-dot-panel`. The schema is versioned and the app does not replace an unsupported existing database. Data from builds before the package rename is not moved automatically.

## Check and build

```bash
pytest -q
ruff check .
python -m pip wheel --no-deps --no-build-isolation --no-index --wheel-dir dist .
python scripts/check-wheel.py dist/win_dot_panel-*.whl
python scripts/build_deb.py dist/win_dot_panel-*.whl
```

The wheel includes the offline emoji dataset, SQL migrations, and CLI entry point. PySide6 is a Python dependency for wheel installs; `wl-clipboard` is an OS package on Wayland. The Debian package declares dependencies on the required Qt, AT-SPI, GI, and clipboard packages. The current Debian build targets Debian 13 and Ubuntu 26.04.

## Publish a release

The shared [release workflow](../../../.github/workflows/release-deb.yml) builds a Debian package from a `win-dot-panel/v<version>-<revision>` tag. It calls separate [code checks](../../../.github/workflows/checks.yml) and [package validation](../../../.github/workflows/package.yml) workflows before publishing. Use the version in `pyproject.toml`. For another release of that version, increment the Debian revision from the [Win Dot Panel releases](https://github.com/elixpo/packages.elixpo/releases?q=win-dot-panel%2Fv); for a new project version, start the revision at `1`. These checks cover lint and formatting, tests, the wheel, Debian package contents and metadata, and its checksum. A failed check prevents the release.

Package-related pushes to `main` also publish numbered prereleases. Their Debian version includes `~main.<run number>`, so regular releases remain newer for APT. Documentation-only pushes do not publish a package.

The shared [product page](../../../web/win-dot-panel/index.html) is published through GitHub Pages with the signed repository. Stable tags publish the newly validated package and redeploy the site. Main prereleases remain GitHub release assets.

The signed APT repository is the normal installation path; see the [APT guide](../../../docs/apt-repository.md). A GitHub release `.deb` can also be installed directly. Copy it to `/var/tmp` with mode `644` before `sudo apt install` so APT's `_apt` user can read it.

The offline emoji data is generated from [Unicode Emoji 18.0](https://www.unicode.org/Public/18.0.0/emoji/emoji-test.txt) and [Unicode CLDR English annotations](https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-annotations-full/annotations/en/annotations.json). It is distributed under the [Unicode License v3](../src/win_dot_panel/resources/UNICODE-LICENSE.txt).

The application code is MIT licensed; bundled emoji data retains the Unicode License v3. The wheel records both notices in its license metadata, and the Debian package installs them under `/usr/share/doc/win-dot-panel/copyright`. PySide6 remains a separately licensed dependency supplied by pip or the system package manager.
