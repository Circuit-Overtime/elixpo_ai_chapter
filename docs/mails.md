# Elixpo Mails — Documentation

Elixpo Mails is a transactional, event-based email SaaS. You bring your own
sender (your Gmail/SMTP account), design templates with {{variable}}
placeholders, attach a signed webhook to a template, and trigger sends from
your service with an HMAC-signed POST. Elixpo Mails handles delivery,
suppression/unsubscribe, and delivery logging.

Base URL: https://mails.elixpo.com

## Core objects

- Workspace — your tenant. You sign in with Elixpo Accounts (SSO).
- Sender — a connected mailbox (Gmail/SMTP + app password) that mail is sent
  *from*. Bring your own; Elixpo Mails never relays through a shared pool.
- Product — a logical app/group of templates. Creating a product gives you a
  client_id and a shared signing secret (shown once). Has a footer
  (logo/address/phone/quote) and a background colour applied to every send.
- Template — the email design (built in the lixeditor WYSIWYG editor) with
  {{variables}} in subject and body. Has a transactional flag.
- Webhook — a signed trigger endpoint attached to a template. Has an
  endpoint_key used in the trigger URL.
- Delivery log — one row per send attempt: sent / failed / suppressed /
  sending, with recipient, template, webhook, error, and merged variables.

The flow: workspace → senders → products → templates → webhooks → delivery logs.

## Authentication — HMAC request signing

Every trigger request is signed with the product's shared secret.

- Header: X-Elixpo-Signature: t=<unix_seconds>,v1=<hex HMAC-SHA256>
- Signed payload string is `${t}.${rawBody}` — the timestamp, a literal dot,
  then the EXACT JSON body bytes you send (sign the raw bytes, not a
  re-serialized copy).
- The HMAC key is the product's shared secret.
- Requests outside a 5-minute tolerance (comparing t to server time) are
  rejected.
- During a secret rotation, the previous secret is also accepted for a short
  grace window, so you can roll the secret without dropping requests.

## Trigger endpoint

POST https://mails.elixpo.com/v1/hooks/<endpoint_key>

The endpoint_key is shown on each webhook.

Request body (JSON):
{
  "to": "user@example.com",
  "variables": { "name": "Ada" },
  "idempotency_key": "optional-dedupe-key"
}

Responses:
- 200 { ok: true, id, status: "sent", to, subject } — sent.
- 200 { ok: false, status: "suppressed", ... } — recipient unsubscribed; a
  successful no-op (not an error). Logged as suppressed.
- 502 { ok: false, status: "failed", error } — downstream send failure.
- 401 — bad/missing signature.
- 400 — invalid timestamp or recipient.
- 403 — disabled webhook/product, or no signing secret configured.
- 404 — unknown endpoint_key.

### Canonical Node.js trigger example

import crypto from "node:crypto";
const secret = "YOUR_PRODUCT_SECRET";
const url = "https://mails.elixpo.com/v1/hooks/whe_xxx";
const payload = JSON.stringify({ to: "user@example.com", variables: { name: "Ada" } });
const t = Math.floor(Date.now() / 1000);
const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Elixpo-Signature": `t=${t},v1=${v1}` },
  body: payload,
});

Important: sign and send the SAME bytes. Build the JSON string once
(`payload`), HMAC over `${t}.${payload}`, and pass that same string as the
request body. Re-serializing would change the bytes and break the signature.

## Quickstart (end to end)

1. Sign in via Elixpo Accounts SSO.
2. Add a sender — connect your Gmail/SMTP account with an app password. This is
   the mailbox every email is sent from.
3. Create a product — you receive a client_id and a shared secret (shown once;
   store it as a server-side environment variable). Roll it later from the
   product page.
4. Design a template in the lixeditor editor; use {{variable}} placeholders in
   the subject and body. Elixpo Mails derives the variable list from the
   template.
5. Add a webhook to the template — you get a signed endpoint with an
   endpoint_key.
6. Sign & POST a trigger from your service (see the Node.js example above).

## Templates & variables

- Use {{var}} placeholders anywhere in the subject and body. At send time each
  is replaced with the matching key from the request's variables object.
- The variable list is derived automatically from the template's placeholders.
- transactional flag: when on, the message bypasses unsubscribe/suppression
  (for receipts, password resets, and other essential mail) and does not carry
  unsubscribe headers. When off, the send is subject to suppression and gets
  List-Unsubscribe headers.
- Per-product footer: logo, address, phone, and a quote are appended to every
  send, along with the product's background colour.
- {{unsubscribe_url}} is available in non-transactional templates.

## Attachments

Three kinds of attachment can be added to a template/send:
- A Google Drive file, picked via the connected Drive account.
- A URL (fetched and attached).
- A {{variable}} resolved per-send (e.g. {{invoice_url}}) — useful for
  per-recipient documents like invoices.

Caps: 10 MB per file, 18 MB per message (total).

## Unsubscribe & suppression

Suppression is platform-managed:
- Every non-transactional send carries List-Unsubscribe + one-click
  (List-Unsubscribe-Post) headers.
- Recipients who unsubscribe are added to the suppression list and skipped on
  future non-transactional sends; that delivery is logged as suppressed and the
  trigger returns 200 { ok: false, status: "suppressed" }.
- {{unsubscribe_url}} is available inside templates for an in-body link.
- Transactional sends are never suppressed.
- Manage the suppression list on the product page.

## Delivery logs

Every send attempt produces a delivery log with status:
- sent — accepted by the sender's mailbox.
- failed — downstream send failure (see error).
- suppressed — recipient is unsubscribed; skipped (successful no-op).
- sending — in flight.

Each log records the recipient, template, webhook, error (if any), and the
merged variables used for the send. Provide an idempotency_key in the trigger
body to dedupe retries — the same key won't send twice.
