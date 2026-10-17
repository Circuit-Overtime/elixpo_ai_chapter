# Elixpo Pay Docs — Overview

Source: https://payouts.elixpo.com/docs

This is one section of the Elixpo Pay developer documentation. Elixpo Pay is the payments and creator payouts platform for Elixpo.

---
# Elixpo Pay — Overview

Elixpo Pay is the payments and payouts layer for the Elixpo ecosystem, and an open SaaS for any developer. It abstracts providers behind one API plus a hosted checkout, a unified ledger, entitlement grants, and creator payouts.

## How it fits together

Your app never touches card data. Your server creates a checkout session with your secret key and redirects the buyer to our hosted checkout; we charge them through a provider (Razorpay for INR in P0), then grant an entitlement and tell your app about it two ways:

- a signed entitlement.updated webhook delivered to your app, and
- a pull endpoint, GET /v1/entitlements?app=&uid=, you can call any time.

## Core concepts

- Merchant — your tenant. You sign in with Elixpo Accounts.
- App — a project under your merchant (e.g. lixblogs), with its own API key.
- Product — a sellable tier (e.g. member).
- Price — a regional/PPP variant of a product in a currency. Each price has a type of one_time (manual re-purchase each cycle) or recurring (autopay mandate, billed automatically).
- Entitlement — the tier + expiry a customer currently holds.
- Subscription — for autopay prices, the recurring billing mandate. We manage the Razorpay subscription, the renewal charges, and emit entitlement.updated on every successful cycle.

## Billing modes

- One-time — buyer goes through Razorpay Checkout, pays once, gets entitlement for the price's interval (e.g. 30 days). Re-buying is manual.
- Autopay (recurring) — buyer goes through Razorpay's hosted mandate page (UPI Autopay or Card eMandate), and Razorpay charges them automatically each cycle. You receive entitlement.updated on every renewal.
Switch modes per price with the type field in your catalog JSON — no other change needed in your integration. See Catalog sync.

## Cancellation

For autopay prices, buyers can self-serve cancel from your app — see Checkout sessions → Cancelling. Graceful by default: access continues through the paid period, then the entitlement expires and you get a final entitlement.updated with active: false.

---

# Integration contracts (verified against the live API)

> These three contracts are what an integrator MUST get exactly right. The
> server endpoints are authed with the app's API key (`Bearer <ELIXPO_PAY_API_KEY>`);
> the inbound webhook is verified with the endpoint's signing secret
> (`whsec_…` = `ELIXPO_PAY_WEBHOOK_SECRET`). The API key alone identifies the
> app — you never pass an app id or price id in request bodies.

## 1. Catalog sync — POST /v1/sync

Push your code-defined catalog. Auth: `Bearer <ELIXPO_PAY_API_KEY>`.

Body:
{
  "app": "<app-slug>",
  "products": [
    { "tier": "pro", "name": "Pro", "description": "…",
      "prices": [
        { "currency": "INR", "unit_amount": 29900, "type": "recurring",
          "interval": "month", "interval_count": 1, "nickname": "pro_inr_monthly" }
      ] }
  ]
}

- Product is keyed by **`tier`** (`^[a-z0-9_]{2,32}$`) — NOT `id`. Missing `tier`
  → `{ "error": "invalid_tier" }`.
- Price fields: **`unit_amount`** (minor units — paise/cents), `type`
  (`recurring` | `one_time`), `interval` (`day|week|month|year`),
  `interval_count`. NOT `amount` / `interval_days`.
- Prices reconcile by (currency, region, interval): matches update, new insert,
  missing-from-payload deactivate.
- Returns HTTP 200 with `{ ok, synced:[…], errors:[…] }`. **200 does NOT mean
  success** — check `ok !== false` and `errors.length === 0`.
- Changing a recurring price's `unit_amount`/`interval_count` re-mints the
  Razorpay plan automatically (the immutable old plan is dropped).

## 2. Checkout sessions — POST /v1/checkout/sessions

Auth: `Bearer <ELIXPO_PAY_API_KEY>`. The price is resolved from
**tier + currency + interval** — you do NOT pass a price id.

Body:
{
  "tier": "pro",
  "currency": "INR",
  "interval": "month",            // 'month' | 'year' (NOT 'monthly'/'annual')
  "customer": { "uid": "<your-user-id>", "email": "buyer@example.com" },
  "return_url": "https://yourapp.com/after-checkout"
}

Returns HTTP 201 `{ id, url, amount, currency, tier, expires_at }`. Redirect the
buyer to `url`. `customer.uid` is the id you'll receive back as `data.uid` in
the webhook — use your own stable user id.

## 3. Webhook delivery & signing (entitlement.updated)

Elixpo Pay POSTs to your registered endpoint. **This scheme is NOT the Elixpo
Mails `t=,v1=` scheme — do not confuse them.**

Headers:
  X-Elixpo-Pay-Event:     entitlement.updated
  X-Elixpo-Pay-Timestamp: <unix_seconds>
  X-Elixpo-Pay-Signature: sha256=<hex>[,sha256=<hex>]

- Signed string is `${timestamp}.${rawBody}` (timestamp from the header, a
  literal dot, then the exact raw body bytes).
- HMAC-SHA256, **hex**, key = the endpoint signing secret (`whsec_…`). The
  header is a **comma-separated list** of `sha256=…` during secret rotation —
  accept if ANY matches. Reject timestamps outside ±5 minutes.

Body envelope — entitlement fields are nested under **`data`**, and the event
type field is **`type`** (NOT `event`):
{
  "id": "whd_…",                  // delivery id — use for idempotency
  "type": "entitlement.updated",
  "created": 1718500000,
  "data": {
    "app": "<app-slug>",
    "uid": "<your-user-id>",      // matches checkout customer.uid
    "tier": "pro",                // the tier name directly — not a product id
    "active": true,
    "status": "active",
    "expires_at": "2026-07-23 19:53:23",   // "YYYY-MM-DD HH:MM:SS" UTC
    "version": 1,
    "provider_subscription_id": "sub_…"     // present on subscription events
  }
}

Handling:
- `active:true` + known paid `tier` → grant that tier, expiry = `expires_at`.
- `active:false` (or unknown/cancelled-at-period-end) → drop to free.
- Respond 2xx fast; non-2xx is recorded as a failed delivery and retried.
- Dedupe on `data.version` (monotonic per entitlement) and/or the delivery `id`.

Subscription lifecycle (all via entitlement.updated):
- First charge / renewal → `{ active:true, status:"active" }`, new `expires_at`.
- Buyer cancels in YOUR app (`POST /v1/subscriptions/cancel`) →
  `{ active:true, status:"cancelled" }` fires **immediately** (keeps access
  until `expires_at`) — **send the cancellation email here** — then a second
  `{ active:false }` at period end → flip tier to free.
- Mandate ended **outside your app** → Razorpay reports it and Pay forwards
  `{ active:true, status:"halted", … }`, distinguished by the **`failed`** flag:
  - `failed:false` → buyer **revoked the UPI/e-mandate** in their bank/GPay/
    PhonePe app (no charge was attempted). Treat as a **cancellation** — send
    the cancellation email.
  - `failed:true` → **card retries exhausted**. Send a **"update your payment"**
    email; recoverable if they re-subscribe.
- Account deletion / app revoke → `{ status:"revoked", active:false }`.

**Detection is universal — you never poll the provider.** Whether the buyer
cancels from your dashboard, revokes the mandate in their UPI app, or the card
fails, it all arrives as `entitlement.updated`. Access always continues to
`expires_at`; the final `{ active:false }` (from the daily expiry sweep) is your
cue to downgrade to free.

### payment.captured (optional — toggle per endpoint)

Same envelope + signature; `type: "payment.captured"`. **This is the event
that carries the amount** — use it for receipts / your ledger (entitlement.updated
has no amount). data:
{
  "app": "<app-slug>", "uid": "<your-user-id>",
  "transaction_id": "txn_…", "provider_payment_id": "pay_…",
  "provider_order_id": "order_…",
  "currency": "INR", "amount": 29900,   // minor units
  "tier": "pro"
}

## 4. Pull entitlement — GET /v1/entitlements?app=<slug>&uid=<uid>

Server-to-server lookup, the reconcile backstop when a webhook is missed.
Auth: `Bearer <ELIXPO_PAY_API_KEY>` (or `X-Elixpo-Pay-Key: <key>`). Returns the
current EntitlementView `{ tier, status, active, expires_at, version }`.

## 5. Cancel subscription — POST /v1/subscriptions/cancel

Auth: `Bearer <ELIXPO_PAY_API_KEY>`.
Body: `{ "customer": { "uid": "<your-user-id>" }, "cancel_at_cycle_end"?: true }`
(default `true` = graceful: access through the current paid period). Response
`{ id, status, current_period_end }`. Idempotent. Drives entitlement.updated back
to your webhook (`status:"cancelled"` now, then `active:false` at period end).
