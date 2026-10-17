# Privacy Policy

_Last updated: June 2026_

LixSketch is an open-source infinite canvas + WYSIWYG docs editor operated by **Elixpo** (Ayushman Bhattacharya). This policy explains what we collect, how we use it, and how we keep it safe. Questions? Email **hello@elixpo.com**.

## Who we are

LixSketch lets you sketch, diagram, and document — solo or alongside the canvas's split docs pane. Sign-in is handled by **Elixpo Accounts** via OAuth 2.0 — we never see or store your password. You can also use LixSketch without an account; everything stays local in your browser's storage.

## What we collect

- **Account details** (only if you sign in via Elixpo Accounts): username, display name, email, and avatar.
- **Workspaces and content**: your canvas scenes (shapes, frames, text, images) and the paired docs editor blocks. Saved to your own workspace under your account.
- **Activity signals**: session ID, last-accessed timestamps on a workspace, save status — used to drive autosave and conflict resolution. We do **not** track view counts, clicks, or analytics across pages.

## How we use it

- Authenticate you and render your workspaces.
- Sync canvas + docs between local storage and the cloud so a refresh / device-switch picks up where you left off.
- Send transactional email only: login alerts and account actions. We do **not** send marketing or product-update emails by default.

## End-to-end encryption

Workspaces are **encrypted in your browser** before they touch our database. We hold ciphertext; the decryption key lives in your session storage. The "E2E" badge in the editor links to a longer explanation. We cannot read your canvas or docs even if we wanted to.

## Images & media

Images you drop into a canvas or a docs block are stored on **Cloudinary** (WebP, HTTPS) when the workspace is signed-in; for anonymous use they stay as `data:` URLs embedded in the scene. Deleting a workspace removes its associated media.

## Where your data lives

- **Workspace scenes & docs**: Cloudflare **D1** (database, ciphertext-only) and **KV** (cache, ciphertext-only).
- **Media**: **Cloudinary** (WebP, HTTPS).
- **Session**: an `httpOnly`, `Secure`, `SameSite=Lax` cookie — not readable by JavaScript.
- **Local-only mode**: when you use LixSketch without signing in, everything stays in your browser's `localStorage` under a session-scoped key. Nothing leaves your device.

## Open source & transparency

LixSketch is open source. You can read exactly how your data is handled in the code at **[LixSketch Open Source Code](https://github.com/elixpo/sketch.elixpo)**. Found a privacy concern? Open an issue or email us.

## Your choices

You can edit or delete any workspace anytime. **Account deletion and app revocation** are handled at [Connected Apps](https://accounts.elixpo.com/dashboard/services).

## Contact

- Questions about your data? Email **hello@elixpo.com**.
- Or open an issue at [Sketch Issues](https://github.com/elixpo/sketch.elixpo/issues/new).
