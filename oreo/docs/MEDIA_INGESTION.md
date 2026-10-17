# Media ingestion and storage boundary

OreoOS never transfers arbitrary source media directly to badge storage. Both
the badge-hosted web page and `tools/media_ingest.py` use the same sequence:

1. detect the source as image, video, Markdown, or text;
2. convert it to a device-native format;
3. validate the complete converted artifact;
4. compare its final byte count with the media budget and free-space reserve;
5. transfer to a temporary `.part` file; and
6. atomically rename it only after validation.

| Content | Stored format | Encoding |
|---|---|---|
| photo | `.rz565` / R5Z v1 | RGB565 big-endian + zlib |
| video | `.rv565` / RV565 v6 | independent zlib RGB565 frames |
| Markdown | `.mdz` / ODZ v1 | UTF-8 + zlib |
| text | `.txtz` / ODZ v1 | UTF-8 + zlib |

Independent video frames provide bounded decode time and make the same file
streamable from memory-mapped internal flash or an SD card. SD support changes
the byte-source backend, not the codec or renderer.

Prepare locally:

```bash
python3 tools/media_ingest.py path/to/media
```

Prepare, query actual badge free space, enforce the reserve, and transfer:

```bash
python3 tools/media_ingest.py path/to/media --to-board --port /dev/ttyACM0
```

Video defaults are 180×135, 24 FPS, and the first ten seconds. They can be
changed with `--width`, `--height`, `--fps`, and `--seconds`. The default
internal-media admission budget is 5 MiB with a 256 KiB reserve; a custom
firmware partition may provide a different value through `--media-budget`.

The final production firmware should expose separate OS and media filesystems.
Gallery and Reader should resolve media from internal storage first and then
the SD mount. Do not flash a new partition table until the custom MicroPython
build mounts both filesystems; changing the table erases the current layout.
