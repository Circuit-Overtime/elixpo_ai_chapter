export const LLM_TEXT = `# ElixpoURL — Documentation

ElixpoURL is an open URL shortener built on Cloudflare's edge. Short links, click analytics, and a developer-first REST API — for any app you ship, Elixpo or not.

Base URL: https://lixrl.com

---

# Overview

ElixpoURL redirects short links through Cloudflare's global network, collects click analytics, and supports custom slugs, bulk deletion, activation controls, and TTLs.

Users sign in via Elixpo Accounts SSO (no separate password). For machine-to-machine access, mint an API key and send it in the Authorization header.

## Conventions
- Base URL: \`https://lixrl.com\`
- API path prefix: \`/api\`
- Requests/responses are JSON unless stated otherwise.
- Errors follow the format \`{ "error": "code", "message": "..." }\` — see Error Reference.

---

# Quickstart (end to end)

1. **Sign in**: Go to \`/api/auth/login\` to sign in through Elixpo Accounts SSO.
2. **Mint API Key**: Go to **Profile → API Keys**, click **Create key**, and copy the printed key (\`elu_...\`). It is SHA-256 hashed on save and won't be shown again.
3. **Shorten URL**: Send a POST request to \`/api/urls\`:
   \`\`\`bash
   curl -X POST https://lixrl.com/api/urls \\
     -H "Authorization: Bearer elu_YOUR_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{
       "url": "https://example.com/your-long-url",
       "title": "Launch announcement",
       "custom_code": "launch"
     }'
   \`\`\`
4. **Response**: Receive the resolved short link details:
   \`\`\`json
   {
     "short_url": "https://lixrl.com/launch",
     "short_code": "launch",
     "original_url": "https://example.com/your-long-url",
     "title": "Launch announcement",
     "created_at": "2026-03-20T12:00:00Z"
   }
   \`\`\`
5. **Watch clicks**: Pull analytics with \`GET /api/urls/{code}/analytics\` or visit the dashboard.

---

# Developer CLI — @elixpo/lixrl-cli

Install the official CLI with Node.js 20 or newer:

\`\`\`bash
npm install --global @elixpo/lixrl-cli
lixrl --help
\`\`\`

## Device authentication

Run \`lixrl login --open\`. The CLI displays an Elixpo Accounts verification URL and one-time code. After identity approval, it opens a Lixrl approval page where the user selects the key name, read or read/write access, and an optional expiry. Lixrl delivers the key directly to the waiting CLI, which stores it in the operating-system keychain. Passwords, browser sessions, and MFA responses never enter the CLI.

The account plan's active-key and request-rate limits remain authoritative. Temporary Accounts tokens remain in memory and are revoked before the Lixrl key is delivered.

## Existing API key

Run \`lixrl login --key\` and paste an existing \`elu_…\` key into the masked prompt. Create or manage keys at \`https://lixrl.com/profile/keys\`. Never put a key in a URL, source file, issue, chat message, generated article, or command argument.

## CI and agents

Provide \`LIXRL_API_KEY\` through the CI platform secret store and always use \`--json --no-input\`:

\`\`\`bash
lixrl whoami --json --no-input
lixrl urls create "https://example.com/article" --title "Article" --tag automation --json --no-input
\`\`\`

## Common commands

\`\`\`bash
lixrl urls list --search launch --json
lixrl urls analytics abc123 --days 30 --json
lixrl urls export --output links.csv
lixrl qr "https://example.com" --format svg --output code.svg
lixrl qr "https://example.com" --track --style aurora --output tracked.svg
lixrl domains list
lixrl skills install lixrl-links
\`\`\`

Deletion, key revocation, subdomain unmapping, and file replacement require explicit confirmation. Agent workflows must not add \`--yes\` without user approval.

For published writing, shorten only public canonical destinations selected by the author. Preserve the original destination, show the proposed replacement, and obtain approval before changing the post. LixBlogs OAuth tokens and Lixrl API keys are separate credentials and must never be substituted.

Full guide: \`https://lixrl.com/docs/cli\`.

---

# Authentication

Endpoints require a scoped API key in the standard Bearer header:
\`\`\`http
Authorization: Bearer elu_YOUR_API_KEY
\`\`\`
Keys contain 32 cryptographically random alphanumeric characters prefixed with \`elu_\`. They must only be sent via the \`Authorization\` header.

## Guest Shortening
The guest endpoint does not accept an API key. It is protected by same-origin browser check, risk scoring, and a 24-hour D1 quota.

---

# Shortening API Reference

## 1. Guest shortening — POST /api/guest/urls
Creates a temporary short link from the public landing page. Expiry is fixed at 24 hours. No click analytics are stored.

### Request Body
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| \`url\` | string | Yes | Absolute HTTP/HTTPS destination (max 2,048 chars). Safe content check applies. |

### Request Example
\`\`\`javascript
fetch('/api/guest/urls', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com/article' })
})
\`\`\`

### Response Example (201 Created)
\`\`\`json
{
  "short_url": "https://lixrl.com/gA1b2C3",
  "short_code": "gA1b2C3",
  "original_url": "https://example.com/article",
  "expires_at": "2026-08-02T10:30:00.000Z",
  "guest": true
}
\`\`\`

### Guest Quota Response (429 Too Many Requests)
Returned when guest limit is exceeded. Returns a \`Retry-After\` header.
\`\`\`json
{
  "error": "Your guest link has already been used. Sign in for persistent links.",
  "account_required": true,
  "available_at": "2026-08-02T10:30:00.000Z"
}
\`\`\`

## 2. Create account link — POST /api/urls
Creates a permanent link owned by your account. Free accounts are capped at 25 links.

### Request Body
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| \`url\` | string | Yes | Absolute HTTP/HTTPS destination. |
| \`title\` | string | No | Human-readable label (1–255 characters). |
| \`custom_code\` | string | No | Pro+. Unique 3–32 character slug (alphanumeric, hyphens, underscores). |
| \`expires_at\` | ISO 8601 | No | Pro+. Future timestamp. If omitted, link does not expire. |
| \`campaign\` | string | No | Campaign label, maximum 64 characters. |
| \`tags\` | string[] | No | Up to 10 normalized tags, maximum 24 characters each. |
| \`utm\` | object | No | Optional source, medium, campaign, term, and content values. |

### Request Example
\`\`\`bash
curl -X POST https://lixrl.com/api/urls \\
  -H "Authorization: Bearer elu_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/long-url",
    "title": "Launch announcement",
    "custom_code": "launch",
    "expires_at": "2026-12-31T23:59:59.000Z"
  }'
\`\`\`

### Response Example (201 Created)
\`\`\`json
{
  "short_url": "https://lixrl.com/launch",
  "short_code": "launch",
  "original_url": "https://example.com/long-url",
  "title": "Launch announcement",
  "created_at": "2026-08-01 10:30:00",
  "expires_at": "2026-12-31T23:59:59.000Z"
}
\`\`\`

## 3. List account links — GET /api/urls
List metadata for account-owned links.

### Query Parameters
| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| \`limit\` | integer | No | Page size from 1–100. Defaults to 50. |
| \`offset\` | integer | No | Offset. Defaults to 0; maximum 100,000. |
| \`search\` | string | No | Case-insensitive search on short code, destination, or title. Capped at 100 characters. |

### Request Example
\`\`\`bash
curl 'https://lixrl.com/api/urls?limit=20&offset=0&search=example' \\
  -H "Authorization: Bearer elu_YOUR_KEY"
\`\`\`

### Response Example (200 OK)
\`\`\`json
{
  "urls": [
    {
      "id": 42,
      "user_id": 7,
      "short_code": "launch",
      "original_url": "https://example.com/long-url",
      "title": "Launch announcement",
      "is_active": 1,
      "clicks": 18,
      "created_at": "2026-08-01 10:30:00",
      "updated_at": "2026-08-01 10:30:00",
      "expires_at": null
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
\`\`\`

## 4. Get account link — GET /api/urls/{code}
Returns the details of a single short link (same object format as list array items). Returns 404 if unknown or belonging to another account.

### Request Example
\`\`\`bash
curl https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY"
\`\`\`

## 5. Update account link — PATCH /api/urls/{code}
Update mutable fields on an existing short link. Send at least one mutable field. The short code itself cannot be changed.

### Request Body
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| \`url\` | string | No | New validated HTTP/HTTPS destination. |
| \`title\` | string \\| null | No | New 1–255 character title, or null to remove. |
| \`is_active\` | boolean | No | Set to false to disable redirects without deleting the link. |
| \`expires_at\` | ISO 8601 \\| null | No | Future timestamp, or null to remove expiry. |

### Request Example
\`\`\`bash
curl -X PATCH https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/new","title":null,"is_active":true}'
\`\`\`

### Response Example (200 OK)
\`\`\`json
{
  "success": true
}
\`\`\`

## 6. Delete account link — DELETE /api/urls/{code}
Permanently removes the short link and all associated click records. Irreversible.

### Request Example
\`\`\`bash
curl -X DELETE https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY"
\`\`\`

### Response Example (200 OK)
\`\`\`json
{
  "success": true
}
\`\`\`

---

# Click Analytics

Redirect events are recorded asynchronously from Cloudflare's edge. Pull daily breakdowns within your plan window with one endpoint.

## Endpoint — GET /api/urls/{code}/analytics?days=30
cURL example:
\`\`\`bash
curl https://lixrl.com/api/urls/my-link/analytics?days=30 \\
  -H "Authorization: Bearer elu_YOUR_KEY"
\`\`\`

### Response Example (200 OK)
\`\`\`json
{
  "timeline":  [{"date": "2026-03-19", "count": 42}],
  "countries": [{"country": "US",       "count": 30}],
  "browsers":  [{"browser": "Chrome",   "count": 25}],
  "devices":   [{"device":  "desktop",  "count": 35}],
  "referers":  [{"referer": "twitter.com", "count": 12}]
}
\`\`\`

## Time Windows
Query parameter \`days\` can be set to:
- \`days=1\` — Last 24h, bucketed by hour
- \`days=7\` — Last 7d, bucketed by day
- \`days=30\` — Last 30d, bucketed by day (default)
- \`days=90\` — Last 90d, bucketed by day

## Retention & Privacy
- **Analytics access windows**: Pro can query 30 days, Business 365 days, and Enterprise 730 days. Free accounts see click totals and a limited dashboard preview.
- **Privacy**: Visitor IPs are never recorded in cleartext. No fingerprinting is performed, and click data is not sold. Country, device, and browser metrics are derived in-memory at redirect time and stored in aggregate.

---

# Webhooks
Get HTTP callbacks when links are created, updated, or clicked. Webhooks are coming soon on the Growth tier. Events will be HMAC-signed and delivered with at-least-once semantics. For suggestions, contact \`hello@elixpo.com\`.

---

# Error Reference

Every error response is JSON with a human-readable \`error\` string. Use the HTTP status for program flow.

## Format
\`\`\`json
{
  "error": "slug_taken",
  "message": "The slug 'launch' is already in use"
}
\`\`\`

## Codes
| code | HTTP | meaning |
| --- | --- | --- |
| \`unauthorized\` | 401 | Missing or invalid API key. |
| \`forbidden\` | 403 | Key exists but doesn't own this resource, or quota / tier limit. |
| \`not_found\` | 404 | No short link found with that code. |
| \`slug_taken\` | 409 | The custom_code you asked for is already in use. |
| \`invalid_url\` | 422 | The destination URL did not parse or failed safe-browsing. |
| \`rate_limited\` | 429 | You hit your tier's quota. |
| \`server_error\` | 500 | Something broke on our side. |

## Retrying
- **4xx Errors**: Deterministic. Fix the input before retrying. For \`rate_limited\` (429), a \`Retry-After\` header is returned indicating wait duration in seconds.
- **5xx Errors**: Transient. Retry with exponential backoff (250ms, 500ms, 1s, 2s, 4s; max 5 tries).

---

# Self-Hosting

ElixpoURL is open source under MIT. You can deploy your own instance to Cloudflare Pages in about ten minutes.

## Prerequisites
- Cloudflare account with Pages and D1 enabled.
- Node.js 22 or newer.
- \`wrangler\` CLI (run \`npm i -g wrangler\`).
- An Elixpo Accounts OAuth app.

## Setup Steps

1. **Clone and Install**:
   \`\`\`bash
   git clone https://github.com/elixpo/elixpourl.git
   cd elixpourl
   npm install
   \`\`\`

2. **Provision D1 Database**:
   \`\`\`bash
   npx wrangler d1 create elixpourl
   # Paste database_id into wrangler.toml
   npm run db:migrate:local
   npm run db:migrate:remote
   \`\`\`

3. **Configure Environment**:
   Copy \`.env.example\` to \`.env\` and fill in OAuth secrets, session secrets, and the site's public URL.

4. **Deploy**:
   \`\`\`bash
   ./deploy.sh build deploy
   \`\`\`
   *Note: Runs \`@cloudflare/next-on-pages\`. Deploys to \`main\` branch by default (override with \`DEPLOY_BRANCH\`). Do not run with \`sudo\`.*

## Updates & Branding
- **Updates**: Pull upstream, run migrations, and rebuild/redeploy. Migrations are gapless.
- **License**: MIT. However, Elixpo branding (wordmark, Oreo mascot, brand palette) is excluded (see \`LICENSES/exceptions/Oreo-trademarks\`). You must customize the branding for self-hosted instances.
`;
