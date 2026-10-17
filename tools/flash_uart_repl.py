"""Enable MicroPython's UART REPL on this ESP32-S3 by installing a tiny
`boot.py` that runs `os.dupterm(UART(0, ...), 1)` at startup.

After this script runs, every boot calls dupterm — REPL becomes available
on UART0 (the line your FTDI is wired to), so `mpremote` and therefore
`tools/deploy.py` work over the FTDI even when the native USB-CDC port
is dead.

Why a separate flashing path:
  Without UART REPL, `mpremote` can't reach the device → can't push
  boot.py via the normal route. But `esptool` talks to the ROM bootloader
  on UART0, which is always alive regardless of MicroPython state, so we
  can write the LittleFS partition directly.

What this script does:
  1. Asks the chip for its partition table → finds the LittleFS partition
  2. Reads the existing filesystem image off the chip (preserves your apps)
  3. Adds (or replaces) `boot.py` inside that image
  4. Writes the modified image back

Requirements:
  pip install littlefs-python esptool

Usage:
  python tools/flash_uart_repl.py /dev/ttyUSB0
"""

import io
import struct
import subprocess
import sys
from pathlib import Path


BOOT_PY = (
    "# Auto-installed by tools/flash_uart_repl.py.\n"
    "# Duplexes MicroPython's REPL onto UART0 so mpremote can talk over an\n"
    "# FTDI even when the native USB-CDC port is unreachable. Harmless to\n"
    "# leave in place permanently - it is a no-op when USB-CDC also works.\n"
    "try:\n"
    "    import os, machine\n"
    "    os.dupterm(machine.UART(0, 115200, tx=43, rx=44), 1)\n"
    "except Exception:\n"
    "    pass\n"
).encode()

PT_OFFSET    = 0x8000          # ESP32 default partition-table offset
PT_SIZE      = 0xC00           # 3 KB is more than enough for a normal PT
PT_MAGIC     = 0xAA50          # entry magic, little-endian uint16
LFS_SUBTYPES = (0x82, 0x81, 0x83)  # littlefs (vfs) subtypes seen across MP builds


def _esptool(port, *args):
    return [sys.executable, "-m", "esptool", "--port", port, "--baud", "460800",
            "--after", "no_reset", *args]


def _esptool_run(port, *args, capture=False):
    cmd = _esptool(port, *args)
    print("  $", " ".join(cmd))
    if capture:
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stdout); print(r.stderr)
            sys.exit("esptool failed (rc=%d)" % r.returncode)
        return r.stdout
    if subprocess.run(cmd).returncode != 0:
        sys.exit("esptool failed")


def _read_chunk(port, offset, size, out_path):
    """Wrapper around `esptool read_flash`. Writes raw bytes to out_path."""
    _esptool_run(port, "read_flash", "0x%x" % offset, "0x%x" % size, str(out_path))


def _write_chunk(port, offset, src_path):
    _esptool_run(port, "write_flash", "0x%x" % offset, str(src_path))


def find_lfs_partition(pt_bytes):
    """Parse the partition table. Returns (offset, size) for the first
    LittleFS partition found, or None.

    Partition entry layout (32 bytes):
      uint16 magic (0xAA50) | uint8 type | uint8 subtype
      uint32 offset         | uint32 size
      char[16] label        | uint32 flags
    """
    for i in range(0, len(pt_bytes), 32):
        entry = pt_bytes[i:i + 32]
        if len(entry) < 32:
            break
        magic, ptype, subtype, off, size = struct.unpack("<HBBII", entry[:12])
        if magic != PT_MAGIC:
            # entries after the end of the table read as 0xFF — stop here
            break
        label = entry[12:28].rstrip(b"\x00").decode(errors="replace")
        if subtype in LFS_SUBTYPES or label.lower() in ("vfs", "littlefs"):
            return off, size, label
    return None


def load_lfs(image_bytes, block_size=4096):
    from littlefs import LittleFS
    block_count = len(image_bytes) // block_size
    fs = LittleFS(block_size=block_size, block_count=block_count, mount=False)
    fs.context.buffer[:] = image_bytes
    try:
        fs.mount()
    except Exception:
        # Fresh / unformatted partition — format it and start clean
        fs.format()
        fs.mount()
    return fs


def main():
    if len(sys.argv) < 2 or not sys.argv[1].startswith("/dev/"):
        print("Usage: python tools/flash_uart_repl.py /dev/ttyUSB0")
        sys.exit(1)
    port = sys.argv[1]

    print("Before continuing, put the ESP32 into bootloader mode:")
    print("  1. HOLD the BOOT button")
    print("  2. tap EN/RST")
    print("  3. release BOOT")
    input("Press Enter when ready...")

    pt_path = Path(".pt_dump.bin")
    print("\nReading partition table from 0x%x..." % PT_OFFSET)
    _read_chunk(port, PT_OFFSET, PT_SIZE, pt_path)

    pt_bytes = pt_path.read_bytes()
    pt_path.unlink(missing_ok=True)

    found = find_lfs_partition(pt_bytes)
    if not found:
        sys.exit("Could not find a LittleFS partition in the partition table.\n"
                 "Edit LFS_SUBTYPES at the top of this script if your firmware\n"
                 "uses an unusual subtype.")
    lfs_off, lfs_size, lfs_label = found
    print("  found LittleFS '%s' at 0x%x  size 0x%x (%d MB)"
          % (lfs_label, lfs_off, lfs_size, lfs_size // (1024 * 1024)))

    lfs_path = Path(".lfs_dump.bin")
    print("\nReading existing LittleFS image (%d MB)..." % (lfs_size // (1024 * 1024)))
    print("  (this can take a minute at 460800 baud — that's expected)")
    _read_chunk(port, lfs_off, lfs_size, lfs_path)

    image = lfs_path.read_bytes()
    fs = load_lfs(image)

    # Drop boot.py into root, replacing any existing one.
    print("\nWriting boot.py into the LittleFS image...")
    with fs.open("/boot.py", "w") as f:
        f.write(BOOT_PY.decode())

    new_image = bytes(fs.context.buffer)
    lfs_path.write_bytes(new_image)

    print("Flashing modified image back to 0x%x..." % lfs_off)
    _write_chunk(port, lfs_off, lfs_path)

    lfs_path.unlink(missing_ok=True)

    print()
    print("✓ Done. Tap EN/RST alone (NOT BOOT this time) to reboot.")
    print("  After a couple of seconds, try:")
    print("    python tools/deploy.py %s" % port)
    print()
    print("If mpremote still times out, the soft-reset workaround is:")
    print("    python -m mpremote connect %s soft-reset" % port)
    print("    python tools/deploy.py %s" % port)


if __name__ == "__main__":
    main()
