# How LixSketch Ensures End-to-End Encryption

When you share a canvas in LixSketch, your data is encrypted **in the browser** before it ever touches our servers. The encryption key lives in the URL fragment (`#key=...`), which browsers never send to servers.

## The Flow

Here's how the encryption pipeline works:

1. **User clicks Share** — the browser serializes the entire canvas scene to JSON
2. **Key generation** — a random AES-GCM 256-bit key is generated using `crypto.subtle.generateKey()`
3. **Encryption** — the scene JSON is encrypted using the generated key
4. **Upload** — only the encrypted blob is sent to our Cloudflare D1 database
5. **Link creation** — the share URL is constructed as `/s/{token}#key={base64Key}`

The `#key=` part is a URL **fragment**. Per the HTTP spec, fragments are never sent to servers. This means:

- Our servers never see your encryption key
- We cannot decrypt your canvas data even if we wanted to
- The key only exists in the sender's and recipient's browsers

## Why AES-GCM?

We chose AES-GCM (Galois/Counter Mode) because it provides both:
- **Confidentiality** — data is encrypted
- **Integrity** — any tampering is detected via the authentication tag

All of this runs through the Web Crypto API (`crypto.subtle`), which is hardware-accelerated in modern browsers.

## What the Server Sees

The server stores:
- An opaque encrypted blob
- A share token (random, not derived from the key)
- Permission level (view/edit)
- Workspace name (optional metadata)

That's it. No plaintext. No key material. No session cookies tied to the content.

```lixscript
// E2E Encryption Architecture
$blue = #4A90D9
$green = #2ECC71
$red = #E74C3C
$gray = #e0e0e0
$purple = #9B59B6

rect browser at 100, 50 size 180x55 {
  stroke: $blue
  label: "Browser"
}

rect encrypt at 100, 160 size 180x55 {
  stroke: $green
  label: "Encrypt (AES-GCM)"
}

rect server at 100, 280 size 180x55 {
  stroke: $purple
  label: "Cloudflare D1"
}

rect recipient at 400, 280 size 180x55 {
  stroke: $blue
  label: "Recipient Browser"
}

rect decrypt at 400, 160 size 180x55 {
  stroke: $green
  label: "Decrypt (AES-GCM)"
}

rect canvas at 400, 50 size 180x55 {
  stroke: $blue
  label: "Loaded Canvas"
}

arrow a1 from browser.bottom to encrypt.top {
  stroke: $gray
  label: "Scene JSON"
}

arrow a2 from encrypt.bottom to server.top {
  stroke: $red
  label: "Encrypted Blob"
}

arrow a3 from server.right to recipient.left {
  stroke: $red
  label: "Encrypted Blob"
}

arrow a4 from recipient.top to decrypt.bottom {
  stroke: $gray
  label: "Key from #fragment"
}

arrow a5 from decrypt.top to canvas.bottom {
  stroke: $green
  label: "Scene JSON"
}
```

## Try It Yourself

Open a canvas, draw something, hit Share, and inspect the URL. You'll see the `#key=` fragment — that's your encryption key, and it never leaves your browser.
