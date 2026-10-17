# Agent Guidelines for url.elixpo

ElixpoURL — open URL shortener on Cloudflare's edge. Next.js 15, Cloudflare Pages (edge runtime), Cloudflare D1 (SQLite). This file is the operating manual for any agent or AI teammate working in this repo.

## Architecture

- **Runtime**: Cloudflare Pages (edge) via `@cloudflare/next-on-pages`. Node.js APIs are NOT available at runtime.
- **Database**: Cloudflare D1 (SQLite). Migrations in `workers/migrations/`. Access via `lib/db.ts`.
- **Auth**: Session cookies issued by `accounts.elixpo` (SSO). Verified in `lib/auth.ts`.
- **Rate limiting**: KV-backed quota enforcement in `lib/ratelimit.ts`.
- **UI**: Next 15 + React 19 + Tailwind (no MUI). Geist sans + mono via `next/font`. Accent color: `#9b7bf7` (`accent.main` in `tailwind.config.ts`).
- **Animations**: framer-motion is installed but new components should prefer the aurora background + small CSS transitions; reserve framer-motion for genuinely interactive elements.

## Repository Structure

```
app/
  page.tsx                   - Landing page (aurora hero + product video)
  layout.tsx                 - Root layout: Geist fonts, SEO, favicon
  globals.css                - Aurora keyframes + base styles
  icon.png / apple-icon.png  - Favicon (Next auto-emits link tags)
  components/
    BackgroundAurora.tsx     - Slow-drifting gradient background, 3 palettes
    Navbar.tsx               - Top bar: brand + GitHub icon + Sign in CTA
    Footer.tsx               - Brand + nav + click-to-copy hello@elixpo.com
    Sidebar.tsx              - Dashboard sidebar (legacy lime — TODO: port)
  pricing/                   - Pricing page ("coming soon" until tiers ship)
  docs/                      - Integrator docs (TODO: split into sections)
  dashboard/                 - Logged-in user dashboard (TODO: aurora port)
  profile/                   - Account profile + API key management
  admin/                     - Admin panel (RBAC-gated)
  login/                     - Sign-in screen
  api/                       - Edge API routes (auth, links, analytics, keys)
  not-found.tsx / not-found/ - 404 fallbacks
lib/
  auth.ts                    - Session verify, SSO callback handling
  db.ts                      - D1 client helpers
  ratelimit.ts               - KV-backed quota enforcement
  types.ts                   - Shared TS types
  utils.ts                   - Misc helpers (slug gen, etc.)
  validate.ts                - Input validation
workers/migrations/          - D1 schema migrations (gapless NNNN_name.sql)
public/                      - Static assets (logo.png, og-image.png, product_pitch.mp4)
.github/                     - GitHub Actions + agent runbooks
```

## Hard Constraints (edge runtime)

These will break the Cloudflare Pages build or fail at runtime if violated:

- **Every API route MUST export `export const runtime = 'edge'`**. Missing this makes the route attempt Node runtime and the build fails.
- **Never import Node built-ins** (`crypto`, `fs`, `path`, `stream`, `buffer`). Use Web APIs.
- **D1 is SQLite**, not Postgres. No `RETURNING *` on multi-row writes, no `JSONB`, no window functions in older binding versions.
- **KV has eventual consistency** (up to 60s globally). Don't use KV as the source of truth for link records — D1 is authoritative. Rate-limit counters in KV are tolerated because eventual consistency only relaxes enforcement.
- **MUI is not installed.** This repo is Tailwind-only. Don't add `@mui/*` to keep the bundle lean.

## Design System

The visual language matches the rest of the Elixpo ecosystem (accounts.elixpo):

- **Background**: `BackgroundAurora` component (drop into any layout, `variant="default" | "auth" | "warm"`).
- **Accent**: purple `#9b7bf7` → `#7c5cff` gradient for primary CTAs. `tailwind.config.ts` exposes this as `accent.main`, `accent.deep`, `bg-gradient-accent`.
- **Surfaces**: glassmorphic cards — `linear-gradient(135deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 100%)` with a soft border. Hover lifts the border to `rgba(155,123,247,0.3)`.
- **Typography**: Geist Sans for headings + body, Geist Mono for code + descriptive prose. Both wired via `next/font` in `app/layout.tsx`.
- **Buttons**: gradient primary (purple → indigo, soft shadow), outlined secondary (white/12 border, accent hover).

The Tailwind config keeps the old `lime` / `sage` / `honey` palettes as aliases pointing at the new purple so unported routes don't visibly break during the migration. **Drop those aliases once every route uses `accent` directly.**

## Migrations

- Location: `workers/migrations/NNNN_<name>.sql`. Number is gapless — pick the next integer.
- Apply locally: `npm run db:migrate:local`.
- Apply to prod: `npm run db:migrate:remote`. **Only via merged PR + deploy**, never from a dev machine.

## Testing

- No test runner is wired yet. Verification is manual:
  1. `npm run dev` (Next dev, not on CF Pages).
  2. `curl http://localhost:3000/api/...` for API changes.
  3. `npm run pages:build` before deploy — only way to catch edge-runtime incompat.

## Deploy

- `./deploy.sh build deploy` — builds and deploys to Cloudflare Pages.
- By default deploys to the **production branch (`main`)**. To deploy a preview from your feature branch, set `DEPLOY_BRANCH=<branch>`.
- Never run with `sudo` — the script writes inside `.vercel/` and `node_modules/`; sudo files break subsequent non-sudo runs. The script refuses to run as root by design.

## Git & PR Workflow

- **Never commit to `main`.** It's branch-protected; use a feature branch.
- Branch naming: `elixpo/<issue-n>-<hex>` for agent-driven; `feat/<slug>` / `fix/<slug>` for manual.
- Commit format: conventional — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`.
- PR title: `[ELIXPO] <short>` for agent PRs.
- PR body ends with `Fixes #N` so GitHub auto-closes on merge.

## Communication Style

- Bullets over paragraphs. <200 words per PR body / comment unless the change genuinely needs more.
- Facts, not opinions. Link specific files/lines rather than describing.
- No marketing language ("seamlessly", "robust", "leverages").
- No hedging ("I think", "maybe").

## Agent Voice

- Never say "Claude", "Claude Code", "AI", "LLM", "analyzing".
- Speak as a teammate: "looking into this", "pushed a fix", "opened #N".

## Workflow Orchestration

- Read `.elixpo-context/context.md` ONCE at the start if injected into the prompt; otherwise use `Glob` / `Grep` to locate files directly. Don't `ls -R`.
- For issue work, follow `.claude/commands/respond-to-issue.md`.
- For commit / push / PR, follow `.claude/commands/commit-push-pr.md`.
- For mechanical bulk refactors (>3 files, renames, string migrations), use `python .github/scripts/apply_refactor.py` with a JSON plan on stdin.

## Common Mistakes

- **`sudo npx` in deploy.sh** — files end up root-owned, breaks subsequent local builds. The fixed `deploy.sh` no longer does this; don't reintroduce it.
- **Deploying without `--branch=main`** — wrangler tags the deploy as Preview for whatever git branch you're on, so production never updates. The fixed `deploy.sh` passes `--branch="${DEPLOY_BRANCH:-main}"`.
- **Putting `router` from `useRouter()` in a useEffect deps array** — the ref is unstable under Next 15.2 + React 19, causing infinite re-render. Use `[]` deps or `window.location.assign(...)` for redirects.
- **Inline fetch functions in useEffect deps** — same loop class as above. Wrap fetch helpers in `useCallback(..., [])` so the ref is stable.
- **Bundling `@mui/*`** — this repo doesn't use MUI. Tailwind-only.
