# oreo.elixpo

Marketing site, app catalogue, and gated file-transfer launcher for the
**Oreo Badge** — `oreo.elixpo.com`.

Built with Next.js 14 (App Router, static export) + Tailwind + Framer
Motion. The single source of truth for brand tokens is
[`theme.js`](./theme.js) at the project root; Tailwind re-exports those
tokens as utility classes (`bg-bg`, `text-primary`, etc.).

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
```

## Deploy to Cloudflare Pages

The site is a fully static export — no Workers runtime needed.

```bash
npm run build                                                 # writes ./out
npx wrangler pages deploy out --project-name=oreo             # CF push
```

Or connect this folder to a Cloudflare Pages project in the dashboard:

| Setting              | Value                              |
|----------------------|------------------------------------|
| Build command        | `npm install && npm run build`     |
| Output directory     | `out`                              |
| Root directory       | `oreo.elixpo`                      |
| Node version         | `20`                               |

## Structure

```
src/
  app/
    layout.tsx        global chrome (Header + Footer)
    page.tsx          home — hero, feature trio, apps showcase
    apps/             preloaded + store catalogue
    badge/            hardware specs
    upload/           gated file-transfer handoff to the badge
    get-started/      flashing + deploy guide
  components/
    Header.tsx        sticky nav + GitHub badge
    Footer.tsx        link columns + brand block
    AppCard.tsx       reusable app tile (Framer-Motion reveal)
    MotionWrap.tsx    shared motion presets
  data/
    apps.ts           preloaded + store catalogue (mirrors manifest.json)
theme.js              brand tokens (colors, radii, motion presets)
tailwind.config.ts    Tailwind config that consumes theme.js
wrangler.toml         Cloudflare Pages deploy config
```

## Brand tokens

The palette + spacing live in [`theme.js`](./theme.js). Any time you
add a new shade or motion preset, add it there first so it shows up in
both Tailwind classes and runtime-imported values automatically.

## /upload

The upload route is *not* itself a transfer endpoint. Browsers block
HTTPS pages from talking to plain-HTTP endpoints on the LAN, and the
badge speaks HTTP only. So `/upload` collects the 6-character code
displayed on the badge screen and hands the user off to
`http://oreo.local/?prefill=<code>` in a new tab — the badge's own
upload page picks up the prefill and continues the gated handshake
from there. End-to-end bytes never leave the local network.
