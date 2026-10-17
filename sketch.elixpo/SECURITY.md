# Security Policy

LixSketch is the canvas+docs application hosted at <https://sketch.elixpo.com> and the engine published as [`@elixpo/lixsketch`](https://www.npmjs.com/package/@elixpo/lixsketch). This document covers what we promise about handling user data, how to report a vulnerability, and what's currently *out* of scope so you know exactly where the boundaries are.

## Reporting a Vulnerability

**Don't open a public GitHub issue.** Vulnerabilities are reported privately so we have a chance to fix them before they're exploited.

### Preferred channel

Email **security@elixpo.com** with:

- A clear description of the issue.
- Reproduction steps (curl commands, screenshots, or a short video).
- The affected URL / package version / commit SHA if known.
- Your assessment of impact (what an attacker could do).
- Your name / handle if you'd like credit; we'll add you to the acknowledgements unless you prefer to stay anonymous.

If email isn't an option, use GitHub's **[private vulnerability reporting](https://github.com/elixpo/sketch.elixpo/security/advisories/new)** for this repo.

Please **do not**:

- Run automated scanners against `sketch.elixpo.com` that generate sustained traffic — manual exploration is fine.
- Access, modify, or exfiltrate other users' data beyond what's needed to demonstrate the issue.
- Test for issues that require physical access, social engineering of staff, or compromise of third-party providers (Cloudflare, the npm registry, the SSO IdP).

### Response timeline

| Stage | Target |
|---|---|
| Acknowledgement | within **2 business days** |
| Initial assessment + severity | within **5 business days** |
| Fix or mitigation in main | within **30 days** for high/critical, **90 days** for medium/low |
| Public disclosure | after a fix has shipped, coordinated with you |

If an issue can't be fixed within those windows we'll tell you why and agree on a new timeline. We don't believe in indefinite embargoes.

### Scope

**In scope:**

- The deployed app at `sketch.elixpo.com` and its API endpoints (`/api/*`, the Cloudflare Worker at the same origin).
- The published packages: `@elixpo/lixsketch` (engine) and the workspace's `@elixpo/lixeditor` integration.
- The repository contents — code, migrations, worker logic, build pipeline.
- Authentication / session handling for the LixSketch surface.

**Out of scope:**

- The Elixpo SSO service itself — report those at [accounts.elixpo](https://github.com/elixpo/accounts.elixpo).
- Cloudflare infrastructure (D1, KV, Durable Objects, Pages) — report directly to Cloudflare.
- Third-party dependencies — if you find an issue in BlockNote, Mantine, RoughJS, etc., please report upstream and let us know so we can pin / patch.
- Denial-of-service via volumetric attacks (we rely on Cloudflare's standard mitigations).
- Self-XSS, social engineering, phishing of unrelated targets.

## What We Promise About Your Data

We aim to be honest about our current security posture rather than to over-market it. Some things are properly hardened; others are works in progress that will get there. Both are listed below.

### Storage

- **Scenes (canvas drawings) are encrypted client-side** with AES-GCM using a per-session key that is generated in your browser and **never transmitted to the server**. The Cloudflare D1 row only contains ciphertext.
- **Canvas documents (the WYSIWYG editor)** use the same per-session key and same ciphertext-only storage model.
- **Workspace metadata** (workspace name, owner id, last-accessed timestamp, byte size) is stored in plaintext to support quotas, share-link permissions, and admin tooling.
- **Auth records** (email, display name, avatar URL from your SSO provider) are stored in plaintext D1 rows. We do not store passwords — authentication happens at the SSO IdP.
- **At-rest encryption of D1 itself** is provided by Cloudflare's storage layer.

If you delete a scene via the UI, the row in D1 is hard-deleted and the paired `canvas_docs` row cascades automatically. We don't keep soft-deleted backups.

### In transit

All traffic is TLS-encrypted via Cloudflare. We don't accept plain HTTP.

### Authentication

- LixSketch uses **Elixpo SSO** (OAuth 2.0). We never see your password.
- Session tokens are stored in `localStorage` for the duration of the session; we currently do not use HTTP-only cookies for the session token. This is a known trade-off — a successful XSS would let an attacker exfiltrate the session token. Treat XSS reports here as high-severity.
- Guest users get a randomly-generated profile id stored in `localStorage`. This is tied to their workspaces and is the only thing identifying them; clearing storage logs them out and detaches their canvases.

### What's *not* end-to-end encrypted today

We want to be specific because the term gets thrown around loosely:

- **Real-time collaboration ops** (cursor positions, shape mutations broadcast via WebSocket through `RoomDurableObject`) currently **pass through the server in cleartext JSON**. Cloudflare Durable Objects can see the contents of every `op` message during a live session. They are not stored long-term — broadcasts are forwarded and forgotten — but if you require strict E2E for collab, **don't use the multi-user room feature for sensitive content yet**. Hardening this to true E2E is on the roadmap.
- **AI features** are currently disabled (coming soon). When they ship, prompts and outputs will pass through the underlying provider and will not be E2E encrypted to LixSketch's keys; that will be documented prominently when the feature returns.

### Sharing & permissions

- Share links use a 32-character random token bound to a specific scene + permission level (`view` / `edit`). Possession of the token grants the listed permission; treat shared URLs accordingly.
- Tokens can be revoked by deleting the scene; we don't yet have a per-token revoke flow (planned).

## Vulnerability Disclosure Hall of Fame

If you've responsibly reported a vulnerability that we shipped a fix for, we'll list you here (with your permission):

- _Be the first._

## Security Updates

Security-relevant fixes are released as patch versions of the npm package and as soon-as-possible deploys of the hosted app:

- npm: `@elixpo/lixsketch` follows semver; patch releases for security fixes.
- App: deployed continuously from `main`. Critical fixes ship within hours; non-critical within the standard release cadence.

Subscribe to the repo's [security advisories](https://github.com/elixpo/sketch.elixpo/security/advisories) (Watch → Custom → Security alerts) to get notified.

## Questions

Anything that isn't quite a vulnerability but feels security-adjacent — e.g., "should this endpoint require auth?", "is this a side-channel?", "does this behaviour match your threat model?" — please email **security@elixpo.com** anyway. We'd rather hear it.
