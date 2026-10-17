# Third-party notices

Nano28C64's own firmware, CLI, documentation, and hardware design are licensed
under the MIT License in `LICENSE`. The following dependencies and library
assets remain under their respective licenses.

## Runtime dependencies

- [pySerial](https://github.com/pyserial/pyserial), BSD license.
- [tqdm](https://github.com/tqdm/tqdm), MPL-2.0 and MIT notices as described in
  its `LICENCE` file.

These packages are included in the standalone executable produced by
`tools/build_cli.sh`. Their copyright and license notices must accompany any
binary release.

## Development and build tools

- [PyInstaller](https://pyinstaller.org/), GPL-2.0-or-later with the PyInstaller
  bootloader exception permitting distribution of generated applications.
- [kiutils](https://github.com/mvnmgrx/kiutils), GPL-3.0. Because the schematic
  generator imports kiutils, `tools/generate_schematic.py` is separately
  licensed under GPL-3.0-or-later. Generated schematic files are not subject
  to that license merely because the generator was used.
- Hatchling and pytest are development tools and are not included in the
  standalone executable.

## KiCad symbols

The schematic incorporates symbols from the official KiCad libraries. Those
libraries are CC-BY-SA 4.0 with KiCad's exception for electronic designs and
generated design files. See the
[KiCad Libraries License](https://www.kicad.org/libraries/license/).
