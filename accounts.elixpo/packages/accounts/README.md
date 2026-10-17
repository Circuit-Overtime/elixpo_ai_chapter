# `@elixpo/accounts`

Edge-safe OAuth 2.0 and OpenID Connect primitives for Elixpo Accounts.

The canonical SDK contract and release policy live in the
[integration reference](https://github.com/elixpo/accounts.elixpo/blob/main/docs/README.md).

Next.js and React adapters are tracked separately and are not exported yet.

## Install

```bash
npm install @elixpo/accounts
```

## Start authorization

```ts
import { createAccountsClient } from "@elixpo/accounts";

const accounts = createAccountsClient({
    issuer: "https://accounts.elixpo.com",
    clientId: process.env.ELIXPO_CLIENT_ID!,
    redirectUri: "https://example.com/auth/callback",
    audience: "example.com",
});

const { url, transaction } = await accounts.createAuthorizationRequest();
// Store transaction in an encrypted, httpOnly, same-site session, then redirect.
```

## Complete authorization

```ts
import { parseAuthorizationCallback } from "@elixpo/accounts";

const { code } = parseAuthorizationCallback(
    request.url,
    transaction.state,
);
const tokens = await accounts.exchangeAuthorizationCode({
    code,
    codeVerifier: transaction.codeVerifier,
});
await accounts.verifyIdToken(tokens.idToken!, transaction.nonce);
```

## Refresh and revoke

```ts
const rotated = await accounts.refresh(tokens.refreshToken);
// Atomically replace the stored token with rotated.refreshToken.
await accounts.revoke(rotated.refreshToken);
```

## Configuration boundaries

- Browser-safe: issuer, client ID, redirect URI, audience.
- Server-only: confidential client secret, refresh tokens, authorization
  transactions, and all returned tokens.
- Hosted Elixpo pages collect passwords, OTPs, passkeys, and MFA responses.
  Third-party applications must not collect Elixpo credentials.

The SDK is optional. Generic OAuth/OIDC clients can use
`/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`.
