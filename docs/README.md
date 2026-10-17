# Elixpo Accounts integration and release reference

This is the single repository-level reference. Consumer documentation lives at
<https://accounts.elixpo.com/docs>, and machine-readable context lives at
<https://accounts.elixpo.com/llms.txt>.

## OAuth and OpenID Connect

Base URL: `https://accounts.elixpo.com`

- OAuth discovery: `/.well-known/oauth-authorization-server`
- OpenID discovery: `/.well-known/openid-configuration`
- Signing keys: `/.well-known/jwks.json`
- Authorization: `/oauth/authorize`
- Token exchange and refresh: `/api/auth/token`
- Revocation: `/api/auth/revoke`
- User info: `/api/auth/me`

Register an application at `/dashboard/oauth-apps`. Use authorization code flow
with S256 PKCE, state, and an OIDC nonce. Redirect URIs must match exactly.
Public clients use PKCE without a secret; confidential clients also authenticate
with their one-time client secret.

Refresh tokens rotate on every successful refresh. Store the replacement
atomically, reject state/nonce mismatches, and verify access and ID tokens using
the published JWKS.

## `@elixpo/accounts`

The runtime-neutral core provides discovery, PKCE, callback parsing, token
lifecycle operations, JWKS verification, and sanitized typed errors.

```ts
import {
  createAccountsClient,
  parseAuthorizationCallback,
} from "@elixpo/accounts";

const accounts = createAccountsClient({
  issuer: "https://accounts.elixpo.com",
  clientId: process.env.ELIXPO_CLIENT_ID!,
  clientSecret: process.env.ELIXPO_CLIENT_SECRET,
  redirectUri: "https://example.com/auth/callback",
});

const { url, transaction } = await accounts.createAuthorizationRequest();
// Persist transaction in an encrypted, httpOnly server-side session.

const { code } = parseAuthorizationCallback(callbackUrl, transaction.state);
const tokens = await accounts.exchangeAuthorizationCode({
  code,
  codeVerifier: transaction.codeVerifier,
});
await accounts.verifyIdToken(tokens.idToken!, transaction.nonce);
```

Client secrets, refresh tokens, authorization transactions, and returned tokens
stay server-side. Hosted Accounts pages own credentials, passkeys, OTP, MFA,
consent, and account selection.

Planned framework adapters will build on the core package and are not exported
by the current stable release:

- `@elixpo/accounts/next`: route handlers, encrypted cookie sessions, guards
- `@elixpo/accounts/react`: provider and account-aware hooks

The metadata field `elixpo_contract_version` tracks protocol compatibility.
Prereleases publish under npm tag `beta`; stable versions publish under `latest`.

## App webhooks

Each OAuth application can register independently signed webhook endpoints:

```http
POST /api/auth/oauth-clients/:client_id/webhooks
Authorization: Bearer <owner-access-token>
Content-Type: application/json

{
  "url": "https://example.com/webhooks/elixpo",
  "events": ["user.deleted", "app.revoked"],
  "label": "production"
}
```

Supported events are `user.deleted`, `user.updated`, `app.revoked`, and
`app.authorized`. The endpoint secret is returned once.

Deliveries include `X-Elixpo-Event-Id`, `X-Elixpo-Event`,
`X-Elixpo-Timestamp`, and `X-Elixpo-Signature`. Verify HMAC-SHA256 over
`${timestamp}.${rawBody}`, reject timestamps outside five minutes, compare in
constant time, and deduplicate event IDs.

Management endpoints:

- `GET /api/auth/oauth-clients/:client_id/webhooks`
- `PATCH|DELETE /api/auth/oauth-clients/:client_id/webhooks/:endpoint_id`
- `POST /api/auth/oauth-clients/:client_id/webhooks/:endpoint_id/rotate`

## External services

Accounts sends transactional mail through `https://mails.elixpo.com`. Requests
use `X-Elixpo-Signature: t=<unix-seconds>,v1=<hex>` with HMAC-SHA256 over the
exact `${timestamp}.${rawBody}` bytes. `MAILS_SHARED_SECRET` is the signing key;
each `MAILS_HOOK_*` variable identifies a template endpoint. Mail delivery is
best-effort and must not fail authentication flows.

Billing uses `https://payouts.elixpo.com` for checkout, subscriptions, catalog
sync, and entitlement updates. Browser clients never receive payout service
credentials. Canonical service documentation remains on each service's hosted
`/docs` route.

## CI, deployment, and npm release

`.github/workflows/deploy.yml` is the release source of truth.

On pull requests it runs Biome, tests, the SDK build, and package inspection. A
successful `main` run then applies D1 migrations, deploys Cloudflare Pages
project `elixpo-accounts`, and publishes the declared `@elixpo/accounts` version if
it is new. After publication, the workflow commits the next patch version
directly to `main`. The site deploy completes before npm publication.

Required GitHub secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | D1 migration and Pages deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler authentication |
| `NPM_TOKEN` | Publish `@elixpo/accounts` |

Protect the `production` and `npm` environments. Runtime application secrets
remain in Cloudflare Pages and are never compiled into the browser bundle.
Allow GitHub Actions to bypass the pull-request rule for the version-only commit
to `main`; all contributor changes continue through pull requests.

`CLOUDFLARE_API_TOKEN` must be a plaintext Cloudflare API token scoped to the
configured account with **D1 Edit** and **Cloudflare Pages Edit** permissions.
Do not use a Global API Key, SOPS ciphertext, surrounding quotes, or the npm
token. If the same secret exists at repository and environment scope, the
environment value takes precedence.
