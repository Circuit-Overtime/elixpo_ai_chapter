# Security at LixSketch

Your canvas data belongs to you. LixSketch is designed so that **we never see your content** — not because of a privacy policy, but because of architecture.

## End-to-End Encryption

When you share a canvas, your data is encrypted **in the browser** using AES-GCM 256-bit encryption before it ever leaves your device. The encryption key is stored in the URL fragment (`#key=...`), which browsers never send to servers.

This means:

- Our servers **cannot decrypt** your canvas data
- No one at LixSketch can view your shared drawings
- The key only exists in the sender's and recipient's browsers
- Even if our database were breached, attackers get only encrypted blobs

## How It Works

Here's the full encryption flow from share to load:

```lixscript
// E2E Encryption Flow
$blue = #4A90D9
$green = #2ECC71
$red = #E74C3C
$gray = #e0e0e0
$purple = #9B59B6

rect browser at 80, 50 size 160x50 {
  stroke: $blue
  label: "Your Browser"
}

rect keygen at 80, 150 size 160x50 {
  stroke: $green
  label: "Generate AES Key"
}

rect encrypt at 80, 250 size 160x50 {
  stroke: $green
  label: "Encrypt Scene"
}

rect server at 80, 370 size 160x50 {
  stroke: $purple
  label: "Server (D1)"
}

rect recipient at 380, 370 size 160x50 {
  stroke: $blue
  label: "Recipient"
}

rect decrypt at 380, 250 size 160x50 {
  stroke: $green
  label: "Decrypt Scene"
}

rect view at 380, 150 size 160x50 {
  stroke: $blue
  label: "View Canvas"
}

arrow a1 from browser.bottom to keygen.top {
  stroke: $gray
  label: "Click Share"
}

arrow a2 from keygen.bottom to encrypt.top {
  stroke: $gray
  label: "AES-GCM 256"
}

arrow a3 from encrypt.bottom to server.top {
  stroke: $red
  label: "Encrypted Blob"
}

arrow a4 from server.right to recipient.left {
  stroke: $red
  label: "Opaque Data"
}

arrow a5 from recipient.top to decrypt.bottom {
  stroke: $gray
  label: "Key from URL #"
}

arrow a6 from decrypt.top to view.bottom {
  stroke: $green
  label: "Decrypted"
}
```

## Web Crypto API

All cryptographic operations use the browser's native **Web Crypto API** (`crypto.subtle`). This is:

- **Hardware-accelerated** on modern devices
- **FIPS-compliant** — uses standard AES-GCM
- **Not a custom implementation** — we rely on browser-native crypto, not a JS library

Key generation uses `crypto.subtle.generateKey()` with AES-GCM, 256-bit key length. Encryption and decryption use `crypto.subtle.encrypt()` and `crypto.subtle.decrypt()`.

## What the Server Stores

When you share a canvas, our Cloudflare D1 database stores:

- An **encrypted blob** — opaque, unusable without the key
- A **share token** — random, not derived from the key
- **Permission level** — view or edit
- **Workspace name** — optional metadata you provide

That's it. No plaintext scene data. No key material. No session cookies tied to content.

## Real-Time Collaboration Security

During live collaboration sessions via WebSocket:

- Each room is an isolated **Cloudflare Durable Object**
- Scene data is relayed between participants — the server acts as a relay, not a store
- No collaboration data is persisted after all participants disconnect
- WebSocket connections use TLS (WSS)

## Data at Rest

- **Canvas scenes** are stored only in your browser's memory during a session
- **Shared canvases** are encrypted blobs in Cloudflare D1
- **Images** uploaded to canvases are stored in Cloudflare R2 with signed URLs that expire
- **No analytics trackers** — we don't use Google Analytics, Mixpanel, or similar services

## Open Source Transparency

LixSketch is **fully open source**. You can audit every line of the encryption implementation:

- The share encryption logic in the frontend
- The Cloudflare Worker that handles storage
- The Durable Object that manages collaboration rooms

If you find a vulnerability, please report it responsibly via GitHub Issues.

## Summary

- **Encryption:** AES-GCM 256-bit via Web Crypto API
- **Key storage:** URL fragment only (never sent to server)
- **Server access:** Zero-knowledge — cannot decrypt your data
- **Collaboration:** Ephemeral relay via Durable Objects
- **Code:** Fully open source and auditable
