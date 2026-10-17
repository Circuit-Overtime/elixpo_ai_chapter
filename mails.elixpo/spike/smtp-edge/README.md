# SMTP-on-edge verification spike (mail.elixpo MVP step 0)

**Question:** can a Cloudflare Worker authenticate to a user's own SMTP host
(e.g. Gmail + app password) over `cloudflare:sockets` and deliver mail?

This is throwaway proof code, not the product. If it works, the real send path
lives in the Queue **consumer Worker** (decided architecture: CF Queue + consumer).
If it can't deliver, we fall back to a Node sender service.

## Why this can't be a Pages route
`@cloudflare/next-on-pages` routes run on the edge runtime with **no raw TCP**.
Classic SMTP needs TCP. A standalone **Worker** can use the native `connect()`
socket API, so the sender must live outside the Pages app. Port **465** is used
here (implicit TLS) — simpler/more reliable on Workers than 587 + STARTTLS.

## Run it

### Local (fastest feedback)
```bash
cd spike/smtp-edge
cp .dev.vars.example .dev.vars   # fill in real test creds (gitignored)
npx wrangler dev
# then hit the printed URL, e.g.:
curl http://localhost:8787/
```

### Deployed (the real test — proves it from Cloudflare's network)
```bash
cd spike/smtp-edge
npx wrangler secret put SMTP_USER   # paste test Gmail address
npx wrangler secret put SMTP_PASS   # paste 16-char app password
npx wrangler secret put MAIL_TO     # paste delivery target
npx wrangler deploy
curl https://mail-elixpo-smtp-spike.<your-subdomain>.workers.dev/
```

## Reading the result
JSON response includes `ok` and a full SMTP `transcript` (creds redacted).
- `ok: true` + a mail actually arrives → **step 0 settled**, build on sockets.
- `235` line present but no mail → auth worked, deliverability/SPF issue.
- error before `220`/`250` → socket/TLS/port problem; inspect transcript.

## Teardown
```bash
npx wrangler delete   # remove the throwaway Worker when done
```
