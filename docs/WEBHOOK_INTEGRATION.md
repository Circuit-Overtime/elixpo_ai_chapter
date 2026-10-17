# Webhook Integration with Elixpo Accounts

ElixpoURL subscribes to user-lifecycle events from Elixpo Accounts so we can
hard-delete a user's links + click history when they delete their Elixpo
account upstream. This page explains how the integration is wired and how to
roll the secret.

## Architecture

```
                 [Elixpo Accounts]
                        │
       webhook_url ─────┤── DB row on `oauth_clients`
       webhook_events ──┤   (this ElixpoURL OAuth app's registration)
       webhook_secret ──┘
                        │
                        │  on user.deleted / user.updated:
                        │  POST <webhook_url>
                        │      X-Elixpo-Event-Id:   <uuid>
                        │      X-Elixpo-Event:      user.deleted
                        │      X-Elixpo-Timestamp:  <unix-seconds>
                        │      X-Elixpo-Signature:  sha256=<hex>
                        ▼
               POST /api/webhooks/elixpo
                  on url.elixpo
                        │
                        │ verifyHMAC(secret, `${ts}.${body}`)
                        │ replay window ±5 min
                        │ dedupe on event-id (KV, 30min)
                        ▼
                  handleUserDeleted(elixpo_id)
                  │
                  ├── DELETE clicks
                  ├── DELETE urls
                  ├── DELETE api_keys
                  ├── DELETE sessions
                  ├── DELETE oauth_tokens
                  ├── DELETE audit_log
                  ├── DELETE users
                  ├── KV.delete url:<short_code>  (every link)
                  └── KV.delete session:<id>      (every session)
```

The receiver code is in
[`app/api/webhooks/elixpo/route.ts`](../app/api/webhooks/elixpo/route.ts) — no
changes needed when migrating to the new SSO-managed secret model.

## Subscribing this ElixpoURL instance

ElixpoURL is itself a registered OAuth app on Elixpo Accounts. To wire (or
re-wire) the webhook:

1. **Get an access token** for the account that owns the ElixpoURL OAuth app
   on accounts.elixpo. (Whoever registered ElixpoURL originally — the
   owner of the `cli_…` client_id.)

2. **Re-register the webhook** by calling the OAuth-clients API. If
   ElixpoURL was registered before the webhook fields existed, you'll
   PATCH (when that endpoint ships) or re-register a fresh `cli_…`:

   ```bash
   curl -X POST https://accounts.elixpo.com/api/auth/oauth-clients \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "ElixpoURL",
       "redirect_uris": ["https://lixrl.com/api/auth/callback"],
       "scopes": ["openid", "profile", "email"],
       "webhook_url": "https://lixrl.com/api/webhooks/elixpo",
       "webhook_events": ["user.deleted", "user.updated"]
     }'
   ```

3. **Capture the response**. The body contains `client_id`, `client_secret`,
   and a **`webhook_secret`** that starts with `whk_`. The secret is shown
   exactly once — copy it now.

4. **Set the env var** in Cloudflare Pages (and `.env.local` for dev):

   ```
   ELIXPO_WEBHOOK_SECRET=whk_<the secret you just got>
   ```

   Re-deploy / restart so the receiver picks up the new value.

5. **Smoke-test** by triggering a real `user.deleted` on a throwaway Elixpo
   account that has signed in to ElixpoURL. Watch the dev/prod logs for
   `[webhook] reject — …` (bad sig means the secret doesn't match) or
   `handleUserDeleted` running cleanly.

## Rotating the secret

If `ELIXPO_WEBHOOK_SECRET` leaks, rotate it on the SSO side via the
management endpoint (rotation POST returns a new plaintext exactly once and
atomically swaps the hash in D1 + the plaintext in KV). Drop the new value
into `ELIXPO_WEBHOOK_SECRET` and redeploy. The old secret stops being
honored as soon as the SSO rotation completes — there's no overlap window,
so coordinate the env-var update with the rotation call.

If you can't reach the SSO admin and need to disable the receiver
temporarily, clear `ELIXPO_WEBHOOK_SECRET` (`""`) and the route returns
`503 Webhook receiver not configured` for every request — fail-closed.

## What the receiver actually does

- **`user.deleted`** — cascade-deletes everything the user owns
  (clicks → urls → api_keys → sessions → oauth_tokens → audit_log → users)
  in a single `db.batch`, then busts every KV cache that referenced the
  user's content. Idempotent.

- **`user.updated`** — light-touch profile sync. Whitelisted fields only
  (`email`, `display_name`, `avatar_url`). Keeps the local mirror current
  so the dashboard shows the same identity that accounts.elixpo shows.

- **Unknown events** — accepted with `{ ignored }` so accounts.elixpo can
  ship new events without breaking this receiver.

See [WEBHOOKS_APP_SUBSCRIPTION.md](https://github.com/elixpo/accounts.elixpo/blob/main/docs/WEBHOOKS_APP_SUBSCRIPTION.md)
on the accounts.elixpo repo for the full sender-side protocol and the
reference verifier code (which is what the receiver here uses).

## Operational checklist

- [ ] `ELIXPO_WEBHOOK_SECRET` set in Cloudflare Pages (encrypted env var)
- [ ] Same value mirrored in `.env.local` for local dev (never committed)
- [ ] `webhook_url` on the SSO-side registration points at the production
      URL: `https://lixrl.com/api/webhooks/elixpo`
- [ ] `webhook_events` includes both `user.deleted` and `user.updated`
- [ ] Receiver test passes:
      `curl -X POST … -H "X-Elixpo-Signature: sha256=…" …` returns 200
- [ ] Dev preview deploys use a *separate* `webhook_url` (e.g. a
      previews subdomain) and a *separate* secret so a preview can't
      accept production events.
