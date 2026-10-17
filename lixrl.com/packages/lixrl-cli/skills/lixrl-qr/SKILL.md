---
name: lixrl-qr
description: Generate Lixrl QR images through the installed lixrl CLI. Use when a user needs a styled SVG, PNG, or JPEG QR code, or a paid tracked QR code backed by Lixrl analytics.
---

# Lixrl Qr

Use the installed `lixrl` executable. Basic local QR generation does not require login. Paid styles, logos, and scan tracking use the active Lixrl profile.

## Workflow

1. Confirm the destination is an `http://` or `https://` URL.
2. Default to SVG for print and scalable assets; use PNG for general sharing and JPEG only when specifically requested.
3. Run `lixrl qr <url> --format <format> --output <path> --json --no-input`.
4. Add `--track` only when the user requests scan analytics. Add `--style` or `--logo` only when requested.
5. Never overwrite an existing file without explicit approval; the CLI requires both `--force` and `--yes`.
6. Return the output path and, for tracked QR codes, the encoded Lixrl short URL.

Available styles are `classic`, `rounded`, `dots`, `classy`, `aurora`, `inverse`, `sunset`, and `forest`. The active plan determines access beyond the basic styles.
