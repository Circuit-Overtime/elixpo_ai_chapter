# Account connector development

The account site lives in `crumb.elixpo` and runs as a Next.js application on
Cloudflare Workers through OpenNext, with D1 and KV bindings.

## OAuth registrations

Register Crumb as a confidential web client in `accounts.elixpo` with scopes
`openid profile email` and these callbacks:

- `http://localhost:3000/auth/callback` for local development.
- `https://crumb.elixpo.com/auth/callback` for production.

No custom Accounts scope is required. Register an Accounts lifecycle webhook:

- `POST https://localhost:3000/api/webhook/account_delete` locally.
- `POST https://crumb.elixpo.com/api/webhook/account_delete` in production.

Subscribe it to `user.deleted`. Accounts must sign the exact request bytes as
`HMAC-SHA256(secret, "<unix timestamp>.<body>")` and send
`X-Elixpo-Timestamp`, `X-Elixpo-Signature: sha256=<hex>`, and a stable
`X-Elixpo-Event-Id`. The destination URL is configured in Accounts as
`ELIXPO_ACCOUNTS_DELETION_WEBHOOK`. Store the separate `whk_…` secret returned
by Accounts in Crumb as `ELIXPO_ACCOUNTS_WEBHOOK_SECRET`.

Register `NEXT_PUBLIC_ELIXPO_CLIENT_ID_CLI` as a public device client with:

- Audience: `crumb.elixpo.com`
- Scopes: `openid profile email`
- Grant: `urn:ietf:params:oauth:grant-type:device_code`

The device client has no client secret or redirect URI.

Register the Pollinations application callback as:

- `http://localhost:3000/api/integrations/pollinations/callback` locally.
- `https://crumb.elixpo.com/api/integrations/pollinations/callback` in production.

Pollinations requests `profile usage` and uses PKCE.

## Local configuration

Copy `crumb.elixpo/.env.local.example` to the repository-root `.env.local` and set:

- `NEXT_PUBLIC_ELIXPO_CLIENT_ID`
- `NEXT_PUBLIC_ELIXPO_CLIENT_ID_CLI`
- `ELIXPO_CLIENT_SECRET`
- `ELIXPO_ACCOUNTS_WEBHOOK_SECRET`
- `POLLINATIONS_APP_KEY`
- `CONNECTOR_ENCRYPTION_KEY` to a high-entropy server secret

Never commit `.env.local`. The local web app runs on port `3000`.

Both local Next.js and `./deploy.sh secrets` use the repository-root
`.env.local`, then fall back per missing key to the SOPS-encrypted root `.env`.

Apply `crumb.elixpo/migrations/0001_initial.sql` to the bound D1 database before
testing. Replace the placeholder D1 and KV identifiers in `wrangler.toml` only
with the resources intended for this project.

The root deployment script provisions and binds the Cloudflare resources with
Wrangler:

```bash
./deploy.sh provision
./deploy.sh secrets
./deploy.sh migrate
./deploy.sh build
./deploy.sh deploy
```

`./deploy.sh all` runs the complete sequence. OpenNext produces the Worker and
static-assets bundle; the first deployment creates the Worker service.

## Connector security

1. The user signs into the Crumb site and links Pollinations with PKCE.
2. Crumb stores the scoped provider token encrypted in D1.
3. `crumb auth login` completes Accounts device authorization using the public
   CLI client. The Accounts access token stays in process memory.
4. The CLI sends that short-lived token to Crumb. Crumb validates its issuer,
   audience, client ID, scopes, expiry, and Accounts profile before releasing
   the already-linked connector over HTTPS.
5. The CLI stores the connector only in the OS keyring.

## Backend route contract

- `GET /api/auth/login` and `GET /auth/callback` — Accounts handshake.
- `POST /api/webhook/account_delete` — signed Accounts deletion hook.
- `GET /api/integrations/pollinations/connect` — start Pollinations PKCE.
- `GET /api/integrations/pollinations/callback` — mint and encrypt the scoped connector.
- `GET /api/terminal/config` — publish non-secret Accounts device settings.
- `POST /api/terminal/exchange` — validate device authorization and return the linked connector.

Frontend work is deferred until the harness, token optimizers, and CLI UI land.
