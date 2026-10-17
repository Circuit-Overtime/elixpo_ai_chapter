# Agent Guidelines for accounts.elixpo

OAuth 2.0 Identity Provider. Next.js 15 on Cloudflare Pages (edge runtime), Cloudflare D1 (SQLite), Web Crypto. This file is the operating manual for any agent or AI teammate working in this repo.

## Architecture

- **Runtime**: Cloudflare Pages (edge) via `@cloudflare/next-on-pages`. Node.js APIs are NOT available at runtime.
- **Database**: Cloudflare D1 (SQLite). Access via `src/lib/db.ts` and the `d1-client` helper.
- **Auth**: JWT access (15 min) + refresh (rotated) tokens in httpOnly cookies. Sign/verify in `src/lib/jwt.ts` (Web Crypto).
- **Email**: Dual transport — `cloudflare:sockets` SMTP in prod (`src/lib/smtp-client.ts`), `nodemailer` fallback in local dev (dynamically imported via string concat to hide from esbuild).
- **Crypto**: Web Crypto API only. All primitives in `src/lib/webcrypto.ts` (UUID, random string, hashing, AES). No Node `crypto`.
- **UI**: MUI v7 + Emotion + Tailwind v4. React 19.

## Repository Structure

```
app/
  (auth)/login/              - Email/password + WebAuthn login
  (auth)/register/           - Registration + OTP email verify
  setup-name/                - Post-register display name setup
  authorize/ + oauth/        - OAuth consent + authorization
  dashboard/                 - Developer portal (sidebar layout)
    oauth-apps/  profile/  webhooks/  services/
  verify/  about/  docs/     - Public pages
  api/auth/                  - Public auth surface (login/register/token/me/...)
  api/sso/                   - Third-party SSO callbacks
  api/avatar/                - Avatar generation (pixel-avatar)
  api/internal/              - Service-to-service (shared-secret)
  api/health/                - Public health check
src/lib/
  db.ts                      - D1 helpers (queries, transactions)
  jwt.ts                     - JWT sign/verify (Web Crypto, HS256)
  webcrypto.ts               - UUID / random / hash primitives
  email.ts                   - Transports + HTML templates
  smtp-client.ts             - cloudflare:sockets SMTP
  oauth-config.ts            - Client registration + scope validation
  api-auth-middleware.ts     - Bearer + session auth for API routes
  rate-limit.ts + rate-limit-middleware.ts  - KV-backed rate limiting
  webhook-service.ts         - Outbound webhook dispatch + retries
  api-key-service.ts         - API key CRUD + hashing
src/workers/migrations/      - D1 schema migrations (wrangler d1 migrations)
types/                       - Shared TS types
scripts/                     - One-off maintenance scripts
```

External consumers of the OAuth API: see `docs/README.md`.

## Hard Constraints (edge runtime)

These will break the Cloudflare Pages build or fail at runtime if violated:

- **Every API route MUST export `export const runtime = 'edge'`** — missing this makes the route attempt Node runtime and the build fails.
- **Never import Node built-ins** (`crypto`, `fs`, `path`, `stream`, `buffer`). Use Web APIs or the helpers in `src/lib/webcrypto.ts`. `Buffer` is polyfilled in some contexts but don't rely on it — use `Uint8Array` + `TextEncoder`/`TextDecoder`.
- **`nodemailer` is dev-only.** It's dynamically imported with string concat (`const mailer = await import('node' + 'mailer')`) so esbuild can't see it. Never `import nodemailer from 'nodemailer'` at top level — that bundles it and the build fails.
- **D1 is SQLite, not Postgres.** No `RETURNING *` on multi-row operations (D1 supports single-row RETURNING only), no window functions in older binding versions, no `JSONB`. Test multi-row queries locally against `wrangler d1 execute --local`.
- **KV has eventual consistency** (up to 60s globally). Never use KV as the source of truth for auth state — D1 is authoritative.

## Migrations

- Location: `src/workers/migrations/NNNN_<name>.sql`. Number is gapless — pick the next integer.
- Apply locally: `npm run db:migrate:local` (re-runs the whole schema), or `wrangler d1 migrations apply elixpo_auth --local`.
- Apply to prod: `npm run db:migrate` (remote). Do this **only** via a merged PR + deploy, never from a dev machine manually.
- Rollbacks are manual — write a reverse SQL file; do not delete the forward migration.
- When adding a column that will be indexed, the index statement goes in the same migration file.

## Biome Workflow

Biome is the single linter/formatter (eslint-config-next is vestigial). The wrapper is `./biome.sh`:

- `./biome.sh` — apply safe + unsafe fixes, quiet output. Run this after edits.
- `./biome.sh ci` — strict check, exit 0 required before commit. CI runs this.
- `./biome.sh check` — full diagnostic report, no writes.

`noExplicitAny` is set to `info` (warnings, not errors) because `any` is used intentionally at OAuth/auth boundaries where runtime validation handles the shape. Don't add `any` elsewhere just to silence the linter.

## Testing

- Vitest is the test runner. `npm test` runs once; `npm run test:watch` for watch mode. CI runs `npm test` on every PR via `.github/workflows/vitest.yml`.
- Test files live in `src/**/__tests__/*.test.ts`. Current coverage is pure-logic only (`webcrypto.ts`). Tests run under Node (vitest default) — Web Crypto is available on Node 20+, which is what CI uses.
- For tests that need Cloudflare bindings (D1, KV) later, switch to `@cloudflare/vitest-pool-workers` (already installed) and add a `wrangler.toml` + pool config. Don't introduce that until a test actually needs it.
- For API/edge changes not covered by tests, the manual loop is still:
  1. `npm run dev`, then `curl -X POST http://localhost:3000/api/...`
  2. Check DB state via `wrangler d1 execute elixpo_auth --local --command "SELECT ..."`
  3. `npm run pages:build` to catch edge-runtime incompatibilities (Web Crypto / cf bindings).
- Never add tests that import Node-only packages — they must remain compatible with edge runtime.

## Git & PR Workflow

- **Never commit to `main`.** It's branch-protected anyway, but don't try.
- Branch naming: `elixpo/<issue-n>-<hex>` for agent-driven, `feat/<slug>` / `fix/<slug>` for manual.
- Commit format: conventional — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`. Include `(#N)` for the issue or PR reference.
- PR title: `[ELIXPO] <short>` for agent PRs, plain conventional otherwise.
- PR body ends with `Fixes #N` so GitHub auto-closes on merge.
- Run `./biome.sh ci` before every commit. CI will reject otherwise.
- Before pushing, verify branch: `git rev-parse --abbrev-ref HEAD`.
- Follow-ups on a merged PR go in a **new** branch — don't revive a merged branch.

See `.claude/commands/commit-push-pr.md` for the branch-state decision tree.

## Common Mistakes (learned from incidents)

These are mistakes agents and contributors have actually made in this repo. Read before touching unfamiliar areas.

- **Forgetting `export const runtime = 'edge'`** on a new API route → build fails with a cryptic edge-runtime error. Always add it.
- **Top-level `import nodemailer`** → bundled into edge output, build fails. Keep the dynamic `'node' + 'mailer'` pattern.
- **Using `crypto.randomUUID()` from Node** → Runtime error. Use `webcrypto.randomUUID()` from `src/lib/webcrypto.ts`.
- **`fetch` without `cache: 'no-store'`** on routes that need fresh data → Next caches aggressively. Set `export const dynamic = 'force-dynamic'` or use `cache: 'no-store'`.
- **Adding a new OAuth scope without updating `src/lib/oauth-config.ts`** → consent screen won't show it, token endpoint silently drops it.
- **Mutating the JWT payload after sign** → signature mismatch. Build the payload object, then sign.
- **Skipping rate-limit middleware on a public auth endpoint** → abuse vector. All public `/api/auth/*` routes must wrap in `rateLimitMiddleware`.
- **Running `wrangler d1 migrations apply` manually on remote** from a dev box. Prod migrations go through CI only.
- **Using `Buffer.from(...).toString('base64')`** → `Buffer` is not reliable at edge. Use `btoa(String.fromCharCode(...bytes))` or the base64 helper in `webcrypto.ts`.

## Communication Style

Applies to PR bodies, issue comments, code review output.

- Bullets over paragraphs. <200 words unless the change is genuinely large.
- Facts, not opinions. Link specific lines (`src/lib/jwt.ts:42`) instead of "the JWT stuff".
- No marketing language ("seamlessly", "robust", "leveraging").
- No hedging ("I think", "maybe", "might want to"). Either it's right or it's not.
- In reviews: focus on what needs improving, not what's already fine. Don't repeat the obvious.

Agent voice specifically: **never say "Claude", "Claude Code", "AI", "LLM", "analyzing", "analysis"**. Speak as a teammate — "looking into this", "pushed a fix", "opened #N".

## Workflow Orchestration (for agents)

- Read `.elixpo-context/context.md` ONCE at the start. Don't `ls`/`find`/`tree` to rediscover what's already on disk.
- Read the trigger (issue or PR) ONCE. Don't repeat `gh pr view` with different `--json` flags.
- Stay strictly in scope. No side quests into other repos, no unrelated refactors.
- For issue work, the decision tree is in `.claude/commands/respond-to-issue.md` — follow it.
- For commit/push/PR, follow `.claude/commands/commit-push-pr.md`.
- Delegate only when it earns its cost. Subagents (`architect`, `red-team`, `refiner`, etc. — pulled from `@elixpo/claudeops`) add turns; skip them for trivial fixes.

## Security Rules

- Never log request bodies that could contain passwords, tokens, or OTPs. Redact at the middleware layer.
- Never expose D1 errors to clients verbatim — they leak query structure. Use `ApiError` from `src/lib/api-auth-middleware.ts` with a sanitized message.
- Client secrets in OAuth are returned **once at creation** and hashed before storage. Never log the raw secret.
- Webhook signing secrets are per-endpoint; rotate via the dashboard, not by editing D1 directly.
- CORS: only the explicit allow-list in `next.config.ts` or per-route `OPTIONS` handler. Don't `*` anything behind auth.

## Deployment

- Merges to `main` auto-deploy via Cloudflare Pages Git integration.
- Preview deployments per PR — URL in the PR status check.
- Secrets live in Cloudflare Pages dashboard and `.env.local` for dev. `.env.example` is the authoritative list of required vars.
- `deploy.sh` is for manual wrangler deploys only (rarely needed).

## Monitoring

- Health check at `/api/health` for uptime probing.
- Cloudflare Pages provides request analytics out of the box.
