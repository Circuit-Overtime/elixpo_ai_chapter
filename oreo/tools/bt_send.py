"""Push a file to the Oreo Badge over BLE.

Usage:
    python tools/bt_send.py path/to/photo.png
    python tools/bt_send.py path/to/notes.md      # detected as markdown
    python tools/bt_send.py path/to/notes.txt
    python tools/bt_send.py notes.txt --as md     # force markdown framing

Requires: pip install bleak

Type detection:
  .png / .jpg / .jpeg / .gif / .bin   →  'I' (image, raw bytes)
  .md                                 →  'M' (markdown, zlib-compressed)
  .txt / anything else                →  'T' (text,     zlib-compressed)

The badge answers each transfer with a single-byte status code over the
TX notify char — see oreoWare/bt.py for the table. The script blocks
until DONE (0x02) or any error byte.
"""

import argparse
import asyncio
import struct
import sys
import zlib
import binascii
from pathlib import Path

try:
    from bleak import BleakClient, BleakScanner
except ImportError:
    print("This script needs `bleak` — pip install bleak", file=sys.stderr)
    sys.exit(1)

DEVICE_NAME = "Oreo"
SVC_UUID = "6f72656f-0000-1000-8000-00805f9b34fb"
RX_UUID  = "6f72656f-0001-1000-8000-00805f9b34fb"
TX_UUID  = "6f72656f-0002-1000-8000-00805f9b34fb"

IMAGE_MAX = 250 * 1024
CHUNK     = 180          # safe under typical BLE MTU (185–244 B)

STATUS = {
    0x01: "START_OK",
    0x02: "DONE",
    0xE1: "TOO_LARGE",
    0xE2: "BAD_CRC",
    0xE3: "BAD_TYPE",
    0xE4: "DECOMPRESS_FAIL",
    0xE5: "WRITE_FAIL",
}


def _detect_type(path, override):
    if override:
        m = override.lower()
        if m in ("i", "image"):    return "I"
        if m in ("m", "md", "markdown"):  return "M"
        if m in ("t", "txt", "text"):     return "T"
        raise SystemExit("unknown --as %r" % override)
    ext = path.suffix.lower()
    if ext in (".png", ".jpg", ".jpeg", ".gif", ".bin"):
        return "I"
    if ext == ".md":
        return "M"
    return "T"


def _build_payload(type_byte, body):
    """type (1B) + length (4B BE) + body + crc32(body) (4B BE)."""
    return (type_byte.encode("ascii")
            + struct.pack(">I", len(body))
            + body
            + struct.pack(">I", binascii.crc32(body) & 0xFFFFFFFF))


def _prepare(path, type_byte):
    raw = path.read_bytes()
    if type_byte == "I":
        if len(raw) > IMAGE_MAX:
            raise SystemExit("image too large: %d B (cap is %d)"
                             % (len(raw), IMAGE_MAX))
        body = raw
    else:
        body = zlib.compress(raw, 9)
    return _build_payload(type_byte, body), len(raw), len(body)


async def _send(path, type_byte):
    payload, raw_len, body_len = _prepare(path, type_byte)
    print("file:  %s" % path)
    print("type:  %s   raw=%d B   wire=%d B" % (type_byte, raw_len, body_len))

    print("scanning for %r ..." % DEVICE_NAME)
    dev = await BleakScanner.find_device_by_filter(
        lambda d, ad: (d.name or "") == DEVICE_NAME, timeout=8.0)
    if not dev:
        raise SystemExit("could not find %r — is BT enabled in Settings?" % DEVICE_NAME)
    print("found: %s (%s)" % (dev.address, dev.name))

    done = asyncio.Event()
    last_status = {"code": None}

    def _on_notify(_handle, data):
        if not data:
            return
        code = data[0]
        name = STATUS.get(code, "0x%02X" % code)
        print("  ← %s" % name)
        last_status["code"] = code
        if code != 0x01:           # anything that isn't START_OK is terminal
            done.set()

    async with BleakClient(dev) as client:
        await client.start_notify(TX_UUID, _on_notify)
        # Send in chunks; tiny BLE write so the controller doesn't refuse
        # any single payload.
        sent = 0
        while sent < len(payload):
            chunk = payload[sent:sent + CHUNK]
            await client.write_gatt_char(RX_UUID, chunk, response=False)
            sent += len(chunk)
            print("  → %d / %d B" % (sent, len(payload)))
        # Wait for terminal status notification.
        try:
            await asyncio.wait_for(done.wait(), timeout=15.0)
        except asyncio.TimeoutError:
            raise SystemExit("badge did not acknowledge transfer in 15 s")

    code = last_status["code"]
    if code != 0x02:
        raise SystemExit("transfer failed: %s" % STATUS.get(code, code))
    print("done.")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("file")
    ap.add_argument("--as", dest="kind",
                    help="force type: image / md / txt (default: detect by extension)")
    args = ap.parse_args()

    path = Path(args.file)
    if not path.exists():
        raise SystemExit("no such file: %s" % path)
    type_byte = _detect_type(path, args.kind)
    asyncio.run(_send(path, type_byte))


if __name__ == "__main__":
    main()
