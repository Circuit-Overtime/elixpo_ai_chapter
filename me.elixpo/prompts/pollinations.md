> Generate text, images, video, audio, realtime voice, and embeddings with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.

**Base URL:** `https://gen.pollinations.ai`

**Get your API key:** [enter.pollinations.ai](https://enter.pollinations.ai/keys)

**Integrations:** [Connect User Wallets](/docs#tag/connect-user-wallets) · [Publish a Model](/docs#tag/publish-a-model) · [Publish an Agent](/docs#tag/publish-an-agent) · [MCP Server](/docs#tag/mcp-server) · [CLI](/docs#tag/cli)

## Quick Start

### Text (Python, OpenAI SDK)

```python
from openai import OpenAI
client = OpenAI(base_url="https://gen.pollinations.ai/v1", api_key="YOUR_API_KEY")
response = client.chat.completions.create(model="openai", messages=[{"role": "user", "content": "Hello!"}])
print(response.choices[0].message.content)
```

### Image (URL — no code needed)

```plaintext
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

### Audio (cURL)

```bash
curl "https://gen.pollinations.ai/audio/Hello%20world?voice=nova" \
  -H "Authorization: Bearer YOUR_API_KEY" -o speech.mp3
```

### 3D (cURL)

```bash
curl "https://gen.pollinations.ai/3d/no_prompt_for_trellis_needed?image=https://inferenceport.ai/img/trellis.jpg&model=trellis-2&resolution=low" \
  -H "Authorization: Bearer YOUR_API_KEY" -o model.glb
```

### Embeddings (OpenAI-compatible)

```bash
curl https://gen.pollinations.ai/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai-3-small","input":"Hello world","dimensions":512}'
```

See `GET /v1/models` for every text, image, audio, video, and embedding model available.

## Authentication

All generation requests require an API key from [enter.pollinations.ai](https://enter.pollinations.ai/keys). Model listing endpoints work without authentication.

| Type | Prefix | Use case | Rate limits | Description |
|------|--------|----------|-------------|-------------|
| Secret | `sk_` | Server-side apps | None | Personal developer key. Never expose in client-side code. |
| App Key (Connect User Wallets) | `pk_` with redirect URIs | Client apps via OAuth / device flow | None on the App Key itself | Publishable App Key used as the OAuth `client_id`. Users authorize; your app receives a scoped `sk_`. |
| Raw publishable | `pk_` with no app binding | Legacy direct spend | 1 pollen / IP / hour | Retained for existing integrations. Do not mint new ones. |

> **Note:** Raw publishable keys (`pk_` used as a generation key in browsers) are **legacy**, not beta. New frontend and mobile apps should use **Connect User Wallets**, also called BYOP (Bring Your Own Pollen): register an App Key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys), then run the OAuth authorization-code flow with PKCE (or the device flow) to obtain a temporary user-authorized secret key (`sk_`). The legacy fragment redirect and device flow remain supported.

Two ways to authenticate generation requests:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

For detailed integration guidance on user-pays authorization, including OAuth discovery and token exchange, see [Connect User Wallets](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).

## Text Generation

Generate text responses using AI models. Fully compatible with the OpenAI Chat Completions API — use any OpenAI SDK by changing the base URL.

| Endpoint | Best for |
|----------|----------|
| `POST /v1/chat/completions` | Full OpenAI compatibility — streaming, tools, vision, structured outputs |
| `GET /text/{prompt}` | Quick prototyping — simple GET, returns plain text |

**Available models:** openai, openai-fast, gpt-oss, gpt-5.4, gpt-5.4-mini, openai-large, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, mercury, command-a-plus, qwen-coder, mistral-small-3.2, mistral, openai-audio, openai-audio-large, gemini-3-flash, gemini, gemini-flash-lite-3.5, gemini-fast, deepseek, gemma, gemma-4-31b, deepseek-pro, grok, grok-large, grok-4.6, gemini-search, midijourney, midijourney-large, claude-fast, claude, claude-sonnet-5, claude-opus-4.6, claude-opus-4.7, claude-large, claude-fable-5, perplexity-fast, perplexity, perplexity-reasoning, kimi, kimi-code, kimi-k3, laguna, longcat, inkling, nemotron, nemotron-3.5-lightning, mimo-v2.5, mimo-v2.5-pro, gemini-large, nova-fast, nova, glm, glm-5.3, llama, llama-maverick, llama-scout, minimax-m2.7, minimax, muse-glimmer, muse-spark-1.2, mistral-large, qwen-coder-large, qwen-large, qwen3.7-max, qwen3.8-2.4t-a95b, qwen3.8-27b, qwen3.8-max, qwen3.7-flash, qwen-vision, qwen-vision-pro, step-flash, step-3.5-flash, qwen-safety

### Prompt caching

On Gemini, Claude, and Nova models, a large static prompt prefix can be cached so repeat requests bill it at a fraction of the input rate. Mark the end of the static prefix with `cache_control` on a content block (not on the message); everything before the marker must be byte-identical across requests, everything dynamic goes after. The first request creates the cache (`usage` reports `cache_creation_input_tokens`); repeat requests within the TTL report `prompt_tokens_details.cached_tokens` at the discounted rate.

```json
{
  "model": "gemini-fast",
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "<large static prompt>",
          "cache_control": { "type": "ephemeral" }
        }
      ]
    },
    { "role": "user", "content": "<dynamic message>" }
  ]
}
```

**Gemini** — the prefix must be at least ~2,048 tokens (~4,096 on Gemini 3 models). Requests with tools are not cached — including built-in tools, so `gemini`, `gemini-3-flash`, `gemini-large`, and the search variants only cache when tools are disabled (`"tools": []`) or a JSON `response_format` is set; `gemini-fast` and `gemini-flash-lite-3.5` cache by default. Cache creates bill at the standard input rate plus a storage fee for the 1-hour TTL ($1 per 1M cached tokens on Flash models, $4.50 on Pro); hits bill at ~10% of input. The storage fee means caching pays off only when the prefix is reused often — roughly a dozen reuses per hour on the cheapest models.

**Claude** — all Claude models cache. The prefix must be at least 4,096 tokens (1,024 on `claude` and `claude-fable-5`); tools are fine. Cache creates bill at 1.25× the input rate (no storage fee); hits bill at 10% of input. The cache lives ~5 minutes, refreshed on each hit.

**Nova** — `nova` and `nova-fast` cache. The prefix must be at least ~1,000 tokens (up to 20K tokens cacheable). Cache creates are free; hits bill at 25% of input. ~5-minute TTL.

## Image Generation

Generate images from text prompts via a simple GET request. Returns JPEG, PNG, or SVG depending on the selected model.

```
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

**Available models:** krea, dreamshaper, kontext, nanobanana, nanobanana-2, nanobanana-2-lite, nanobanana-pro, seedream5, seedream5-pro, seedream, seedream-pro, ideogram-v4-turbo, ideogram-v4-balanced, ideogram-v4-quality, gptimage, gptimage-large, gpt-image-2, flux, zimage, zimage-fal, wan-image, wan-image-pro, qwen-image, qwen-image-3, grok-imagine, grok-imagine-pro, grok-imagine-image-2.0, recraft-v4.1-vector, klein, p-image, p-image-edit, nova-canvas

### Community image models

Community image models use an owner/model id and support generation through `/image/{prompt}` and `/v1/images/generations`. The registration test adds image input and `/v1/images/edits` metadata when the registrant's edit endpoint succeeds. OpenAI-compatible responses use `b64_json`; URL responses are not supported for community models. See `/image/models` for the live model list and supported endpoints.

## Video Generation

Generate videos from text prompts or reference images. Returns MP4.

```
https://gen.pollinations.ai/video/sunset%20timelapse?model=veo&duration=4
```

**Available models:** veo, seedance-pro, seedance-2.0, seedance-2.0-mini, seedance-2.0-fast, wan, wan-fast, wan-pro, wan-3.0, grok-video-pro, grok-imagine-video-1.5, seedance-2.5, happyhorse-1.1, minimax-h3, p-video, nova-reel

## Realtime

OpenAI-compatible Realtime WebSocket for voice, multimodal, and transcription sessions.

| Endpoint | Description |
|----------|-------------|
| `GET /realtime` | Pollinations Realtime session (`model=gpt-realtime-2.1`) |
| `GET /v1/realtime` | WebSocket Realtime session (`model=gpt-realtime-2.1`) |

Requires an API key with positive balance. Server clients can use `Authorization: Bearer <key>`; browser WebSocket clients can use `?key=pk_...`.

The WebSocket settles one billing event when the session closes. Selecting `scribe-realtime` creates a transcription session automatically; other realtime models create voice and multimodal sessions.

Events sent and received over both routes use the OpenAI Realtime protocol. See OpenAI's [Realtime WebSocket events guide](https://developers.openai.com/api/docs/guides/realtime-websocket#sending-and-receiving-events).

```js
import WebSocket from "ws";

// Server: Bearer auth. Browser: append `&key=pk_...` instead (headers aren't settable).
const ws = new WebSocket(
    "wss://gen.pollinations.ai/v1/realtime?model=gpt-realtime-2.1",
    { headers: { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` } },
);

ws.on("open", () => ws.send(JSON.stringify({
    type: "session.update",
    session: { type: "realtime", instructions: "Be concise." },
})));
ws.on("message", (m) => console.log(JSON.parse(m.toString())));
```

**Browser audio:** play the model's audio through an `<audio>` element (e.g. a Web Audio `MediaStreamDestination` set as the element's `srcObject`), not straight to the Web Audio output. The browser only uses audio-element output as the echo-cancellation reference, so without it the mic re-captures the model's voice and it starts replying to itself. The WebRTC transport handles this automatically; on the WebSocket transport it's the client's responsibility.

**Realtime models:** gpt-realtime-2.1, gpt-realtime-2.1-mini, gpt-realtime-2, scribe-realtime, gpt-live-transcribe

## 3D Generation

Generate 3D models from text prompts and images via a simple GET request.
Returns glTF Binary in GLB format. Depending on the model, certain models
ignore text inputs — any text prompt passed to the Trellis 2 family will be
ignored; only the image URL is used.

https://gen.pollinations.ai/3d/no_prompt_for_trellis_needed?model=trellis-2&resolution=low&key=YOUR_KEY_HERE&image=IMAGE_URL_HERE

**Available models:** trellis-2, hyper3d-rodin

> **Note:** `hyper3d-rodin` requires Paid Pollen. `trellis-2` (the default)
> supports `low`, `medium`, and `high` resolution and works with Quest Pollen.

## Audio Generation

Text-to-speech, music generation, and audio transcription.

| Endpoint | Description |
|----------|-------------|
| `GET /audio/{text}` | Simple URL-based TTS or music generation |
| `POST /v1/audio/speech` | OpenAI-compatible TTS |
| `POST /v1/audio/transcriptions` | Speech-to-text transcription |

**Audio models:** elevenlabs, elevenflash, eleven-multilingual-v2, eleven-dialogue, eleven-voice-changer, eleven-voice-isolator, elevenmusic, lyria-3-clip, eleven-sfx, whisper, gpt-transcribe, scribe, grok-transcribe, grok-tts, universal-2, universal-3.5-pro, stable-audio-3-medium, stable-audio-3-large, fish-audio-s2.1-pro, qwen-tts, qwen-tts-instruct, csm-1b, kokoro

**Available voices:** alloy, echo, fable, onyx, nova, shimmer, ash, ballad, coral, sage, verse, rachel, domi, bella, elli, charlotte, dorothy, sarah, emily, lily, matilda, adam, antoni, arnold, josh, sam, daniel, charlie, james, fin, callum, liam, george, brian, bill

## Embeddings

Generate vector embeddings with an OpenAI-compatible response format.

| Endpoint | Description |
|----------|-------------|
| `POST /v1/embeddings` | OpenAI-compatible embeddings endpoint |
| `GET /embeddings/models` | Embedding models with pricing and modalities |

`gemini-2` supports text, image, audio, and video inputs. `cohere-embed-v4` supports text and one image per input. The OpenAI and Qwen embedding models are text-only.

String batch input supports up to 32 items. For retrieval, use `task_type` with Gemini text input (it is converted to the recommended prompt instruction) or `input_type` (`query` or `document`) with Cohere. Dimensions are model-specific: Cohere supports 256, 512, 1024, or 1536; `openai-3-small` supports up to 1536; `gemini-2` and `openai-3-large` support up to 3072; `qwen3-embedding-8b` supports up to 4096.

Gemini task instructions count toward prompt token usage. Cohere requests containing an image expose one combined usage count, so any accompanying text is billed at the image-input rate.

**Gemini GA migration:** `gemini-2` now uses the GA embedding space. Do not mix preview-era and GA vectors; re-embed stored `gemini-2` data before comparing it with new results.

**Embedding models:** gemini-2, openai-3-small, openai-3-large, cohere-embed-v4, qwen3-embedding-8b

## Models

Discover available models with pricing, capabilities, and metadata. No authentication required.

| Endpoint | Returns |
|----------|---------|
| `GET /models` | All models with pricing, capabilities, and metadata |
| `GET /v1/models` | All models in OpenAI-compatible format (`{object: "list", data: [...]}`) |
| `GET /text/models` | Text models with pricing, context window, tool support |
| `GET /image/models` | Image & video models with capabilities and pricing |
| `GET /video/models` | Video models with capabilities and pricing |
| `GET /audio/models` | Audio models with supported voices |
| `GET /embeddings/models` | Embedding models with supported modalities |
| `GET /3d/models` | 3D Generation models with supported modalities |

### Query Parameters

All model discovery endpoints accept an optional `community` query parameter:

| Parameter | Values | Behaviour |
|-----------|--------|-----------|
| *(omitted)* | | Returns all models (default, backward-compatible) |
| `community=false` | `false`, `0` | Excludes community models — returns official models only |
| `community=true` | `true`, `1` | Returns community models only |

Any other value (e.g. `tru`, `yes`, `2`) returns **400 Bad Request**.

Example: `GET /models?community=false`

Rich model endpoints include `capabilities` for agentic/model traits:
`tool_calling`, `reasoning`, `web_search`, and `code_execution`.
Modalities, video frame controls, voices, and context length remain separate
structured fields.

## Community Models

Community models use an `owner/model` id and appear in the same discovery responses as Pollinations-operated models. Use `community=true` to return only community models or `community=false` to exclude them.

For registration, publishing, pricing, fallbacks, and health monitoring, see [Publish a Model](/docs#tag/publish-a-model). For ownership endpoints and schemas, see [Community Models](/docs#tag/community-models) under Resources.

## Media Storage

Upload images, audio, and video and get back a unique id and URL. Each upload gets its own id (re-uploading the same bytes yields a new one).

Base URL: https://media.pollinations.ai

| Endpoint | Description |
|----------|-------------|
| `POST /upload` | Upload a file, receive a unique media URL |
| `GET /{id}` | Retrieve a previously uploaded file |
| `GET /{id}/metadata` | Get file metadata as JSON |
| `GET /media?tag={tag}` | List the public gallery for a tag (no auth) |
| `DELETE /media/{id}` | Delete a published item you own (secret `sk_` key) |

Upload requires an API key; retrieval is public. The decoded/file-size limit is 100MB for both upload formats. Files use a 30-day lifecycle from upload or the latest refresh. Retrieving the file body refreshes that lifecycle only when the object is at least 15 days old; metadata and HEAD requests do not refresh it. Two upload formats are accepted:

Multipart form (browsers, files on disk):

```bash
curl -X POST "https://media.pollinations.ai/upload" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F file=@path/to/image.png
```

Base64 JSON (programmatic callers that already hold the bytes):

```bash
curl -X POST "https://media.pollinations.ai/upload" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data": "<base64-or-data-uri>", "contentType": "image/png", "name": "image.png"}'
```

**Tags publish (alpha).** An optional `tags` field (comma-separated string, or a JSON array in the JSON format) publishes the upload into each tag's public gallery, where anyone can list it via `GET /media?tag={tag}`. Untagged uploads stay unlisted — reachable only by their unguessable id URL. Full endpoint reference: https://media.pollinations.ai/openapi.json

## Account

Self-service endpoints for the authenticated user. All endpoints require authentication (API key or session). API keys need the relevant `account:<scope>` permission. Base path: `/account`.

`account:usage` is the read-only account-state scope for balances, usage, quests, and earnings. `account:keys` manages keys and, where enabled, my-models. These permissions are independent; request both when a client needs both. Newly created child keys cannot receive `account:keys` through this API.

| Endpoint | Description |
|----------|-------------|
| `GET /account/profile` | GitHub username, image, and community model access |
| `GET /account/balance` | Current pollen balance |
| `GET /account/quests` | Read-only quest status |
| `GET /account/usage` | Per-request usage history with costs (account-wide) |
| `GET /account/usage/daily` | Daily aggregated usage for dashboards |
| `GET /account/key/usage` | Usage history for the calling API key only |
| `/account/agents` | Managed prompt-agent configuration |
| `/account/my-models` | Private community model registration and allowlisted public publishing |
| `GET /account/key` | API key validity, type, and permissions |

### GET /account/profile

Returns user profile. `githubUsername`, `image`, and `communityEndpointsAllowed` are always included. `name` and `email` are included only when the API key has `account:profile`.

### GET /account/balance

`balance` is the amount visible to this caller and is kept stable for existing clients:

- Budgeted API keys always get the key's remaining budget in `balance` (no extra scope).
- Sessions and unbudgeted keys get the account total (Quest Pollen + paid) in `balance`. That path requires `account:usage` for API keys.

When the caller can view account usage (dashboard session or `account:usage`), the response also includes `accountBalance: { total, tier, paid }` so clients can see Quest Pollen vs paid Pollen. Budgeted keys without `account:usage` do **not** receive `accountBalance` — that would leak the owner's wallet.

### GET /account/key/usage

Usage history for the API key used in the request. No extra scope — a key can always read its own usage. For account-wide usage across all keys, use `GET /account/usage` with `account:usage`.

### GET /account/quests

Returns the quest catalog with account status. `completed` includes both globally completed quests and quests earned by the account. Requires `account:usage`. Claiming rewards is dashboard-only.

### GET /account/usage

Per-request usage history: model, token counts, cost, response time. Requires `account:usage`.

### GET /account/usage/daily

Daily aggregated usage suitable for dashboards. Requires `account:usage`.

### GET /account/key

Returns the current API key's validity, type, and permissions.

### /account/agents

Create and manage prompt agents and their callable `owner/name` model listings in one operation. `POST /account/agents` requires `name`, `title`, `systemPrompt`, and `baseModel`; `description`, `visibility`, and `mcpServers` are optional. `PATCH /account/agents/{id}` replaces the runtime configuration and can update listing fields. Managed agents are text-only and free, with no owner-set prices, fallbacks, or per-user request limit. Calls still consume Pollen for the base model and tool generations. API keys require `account:keys`.

See [Publish an Agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) for dashboard, CLI, and API examples.

### /account/my-models

Community text, image, and speech-to-text model management. Any authenticated account can list, create, update, delete, and call its private owner-only models. Text providers expose `/v1/chat/completions`; image providers expose `/v1/images/generations` and may also expose `/v1/images/edits`; transcription providers expose `/v1/audio/transcriptions`. Image responses use `b64_json`. The endpoint test detects image-edit support and selects image pricing: valid OpenAI image token usage enables per-1M-token pricing, otherwise a fixed Pollen price is charged once per successful generated image.

Public publishing requires `communityEndpointsAllowed: true`; [request account-level publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml) with the allowlist form. Inspecting and testing an upstream endpoint is open to every account, limited to one probe every 30 seconds. The form does not register individual models. API keys require `account:keys`. The dashboard, Account API, and `polli my-models` support text, image, and transcription registration. See [Publish a Model](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_MODEL.md) for setup, publishing, pricing, fallbacks, and health monitoring.

## Safety

Optional safety checking runs on text input before generation. Omitted, `false`, or `0` means off.

For community models, enabled checks run before text is sent to the provider or a configured fallback.

Use `safe` as a query parameter or JSON body field, or send the same value in the `Pollinations-Safe` header.

Values: `privacy` redacts personal information like names, email, phone, address, IP, URLs, and usernames. `secrets` redacts keys and passwords. `sexual`, `violence`, and `shield` block matching requests. Aliases: `true` = `privacy,secrets`, `nsfw` = `sexual,violence`.

```bash
curl "https://gen.pollinations.ai/text/email%20me%20at%20a%40example.com?safe=privacy" \
  -H "Authorization: Bearer YOUR_API_KEY"

curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Pollinations-Safe: privacy" \
  -d '{"model":"openai","messages":[{"role":"user","content":"email me at a@example.com"}]}'
```

Large requests check the latest 50,000 text characters, across up to 25 text parts, in one safety call.

Blocked requests return `400` with `error.type: "safety_error"`. Safety service failures return `503`. Check `X-Safety-Applied`, `X-Safety-Redacted`, and `X-Safety-Status` headers.

## Errors

All errors return JSON with a consistent shape:

```json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Description of what went wrong"
  }
}
```

| Status | Meaning |
|--------|---------|
| `400` | Invalid parameters or malformed request |
| `401` | Missing or invalid API key |
| `402` | Insufficient pollen balance |
| `403` | API key lacks required permission |
| `500` | Internal server error |

### Timeouts and retries

If your client or proxy times out, send the exact same request again. Keep the endpoint, body, query parameters, and seed unchanged.

The generation continues after the connection closes. The retry waits for the generation already in progress or receives the completed cached result, instead of starting another generation. Only the generation is billed; retries and cache hits are not.

This applies to cache-backed, non-streaming text, embedding, image, video, 3D, audio, and transcription requests, including the OpenAI-compatible endpoints. Streaming text and uncached endpoints run independently.

## Public Stats

Anonymous, read-only platform statistics served directly from Tinybird. No
account or API key needed — pass the shared public read token as a query param.

Base URL: `https://api.europe-west2.gcp.tinybird.co`

Public read token (safe to embed client-side):

```
p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8
```

| Endpoint | Params | Returns |
|----------|--------|---------|
| `GET /v0/pipes/public_model_stats.json` | `limit` (50) | Per-model usage over the last 7 days: request count, typical (median) cost, avg response time |
| `GET https://gen.pollinations.ai/v1/models/status` | `minutes` (60, max 10080) | Per-model health in a recent window: 2xx/4xx/5xx counts, latency p50/p95. Use this cached gateway instead of calling Tinybird directly. |
| `GET /v0/pipes/weekly_health_stats.json` | `weeks_back` (12) | Weekly service availability (`2xx / (2xx + 5xx)`, cache excluded) and latency |
| `GET /v0/pipes/app_top_weekly.json` | — | Top 10 registered apps owned by showcase contributors, by request count over the last 7 days. The owner is listed in the directory; the returned app may be any of their registered apps |
| `GET /v0/pipes/app_directory_public.json` | `category`, `platform`, `limit` (1000) | The community app directory ([app.json](https://github.com/pollinations/pollinations/blob/main/operations/app-management/app.json)) |

Tinybird responses are JSON: a `data` array of rows plus a `meta` array typing
each column. Append `&token=<public-read-token>` to authenticate them. The
model status gateway has the same response shape and does not require the
Tinybird token.

The model status gateway reports the Tinybird fetch time in the
`X-Model-Status-Timestamp` response header. It also sets
`X-Model-Status-Stale: true` when returning cached data during a Tinybird
failure.

```bash
curl "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?limit=5&token=PUBLIC_READ_TOKEN"
```

## Connect User Wallets

Connect User Wallets—also called BYOP (Bring Your Own Pollen)—lets your users authorize your app to spend their own Pollen on Pollinations requests. Your publishable App Key (`pk_...`) identifies the app; after approval, Pollinations returns a scoped user key (`sk_...`) for API calls.

Users stay in control of their balance, budgets, and revocation; your app never has to pay for their usage.

## 🗝️ App Key

An **App Key** (`pk_...`) is the publishable key your app sends users to Pollinations with. Without one, the consent screen falls back to the redirect hostname and traffic isn't attributed to your account.

To create one, go to [enter.pollinations.ai](https://enter.pollinations.ai/keys) → **Create New App Key**:

<p align="left"><img src="https://media.pollinations.ai/28716f8fb8677eff" alt="Edit App Key" width="420"></p>

Set the **Name** (shows on the consent screen). For web apps, add at least one **Redirect URI** (your exact callback URL). The key you get back is your `client_id` (a `pk_...` publishable key; the legacy name `app_key` is still accepted).

When a user lands on the consent screen signed-out, they're prompted to continue with GitHub:

<p align="left"><img src="https://media.pollinations.ai/f9fd70e72156ddec" alt="Authorize — signed out" width="420"></p>

Once signed in, they review the requested access and confirm:

<p align="left"><img src="https://media.pollinations.ai/2ab9b5e0a2408e93" alt="Authorize — signed in" width="420"></p>

## Developer Earnings

Developer earnings are opt-in per App Key. When enabled, users pay 25% over base rates. The markup credits to your balance.

```text
Base request cost: 1.00 pollen
User pays:         1.25 pollen
You receive:       0.25 pollen
```

Credits land in the same balance type the user paid from: Quest Pollen when the request used Quest Pollen, Paid Pollen when it used Paid Pollen.

Pass `earningsEnabled: true` when creating an App Key via the API, or toggle it later from the dashboard:

```bash
curl -X POST https://gen.pollinations.ai/account/keys \
  -H 'Authorization: Bearer sk_yoursecretkey' \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-app","type":"publishable","redirectUris":["https://myapp.com/callback"],"earningsEnabled":true}'
```

## ⚙️ Web Apps (OAuth Code Flow)

Use the OAuth authorization-code flow with PKCE for new web integrations. It keeps the `sk_...` key out of the browser callback URL and works with standard OAuth clients.

Discovery is available at:

```text
https://enter.pollinations.ai/.well-known/oauth-authorization-server
```

### 1. Build the Auth Link

Generate a fresh PKCE verifier and S256 challenge, then send the user to `/authorize`:

```text
https://enter.pollinations.ai/authorize
  ?response_type=code
  &client_id=pk_yourkey
  &redirect_uri=https://myapp.com/callback
  &scope=profile%20usage
  &state=random-csrf-token
  &code_challenge=BASE64URL_SHA256_VERIFIER
  &code_challenge_method=S256
```

With restrictions:
```text
https://enter.pollinations.ai/authorize?response_type=code&redirect_uri=https://myapp.com/callback&client_id=pk_yourkey&scope=usage&models=flux,openai&expiry=7&budget=10&state=random&code_challenge=...&code_challenge_method=S256
```

| Param | What it does | Example |
|-------|-------------|---------|
| `client_id` | Your publishable key — shows app name + author on consent screen, tracks traffic and developer earnings | `pk_abc123` |
| `redirect_uri` | Where users return after authorizing — must exactly match a Redirect URI on the App Key, query string included (loopback `http://localhost` matches any port) | `https://myapp.com/callback` |
| `response_type` | Use `code` for the OAuth authorization-code flow | `code` |
| `state` | Opaque value echoed back on the callback for CSRF protection | `any-random-string` |
| `code_challenge` | Base64url SHA-256 of your PKCE verifier | `abc...` |
| `code_challenge_method` | Must be `S256` | `S256` |
| `scope` | Account access (space or comma separated) | `usage keys` |
| `models` | Restrict to specific models | `flux,openai,gptimage` |
| `budget` | Numeric Pollen cap. Defaults to `5`; users can clear the budget field on the consent screen for unlimited. | `10` |
| `expiry` | User-authorized key lifetime in days (default: 7) | `7` |

Legacy names `app_key`, `redirect_url`, and `permissions` are still accepted for backwards compatibility.

### 2. Handle the Redirect

User comes back with a short-lived code:

```text
https://myapp.com/callback?code=oauth_code&state=random-csrf-token
```

Validate `state`, then exchange the code at the token endpoint. Server-backed apps
call it from their backend; static browser apps can call it directly, because PKCE
replaces the client secret:

```bash
curl -X POST https://enter.pollinations.ai/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code=oauth_code' \
  -d 'client_id=pk_yourkey' \
  -d 'redirect_uri=https://myapp.com/callback' \
  -d 'code_verifier=YOUR_PKCE_VERIFIER'
# → { "access_token": "sk_...", "token_type": "bearer", "expires_in": 604800, "scope": "profile usage" }
```

The authorization code is single-use and expires after 10 minutes. Token responses use RFC 6749 error objects such as `invalid_grant`, `invalid_request`, and `unsupported_grant_type`.

Scopes: `profile` (name + email), `usage` (account balance + usage), `keys` (account admin — create/list/revoke keys). The response's `scope` echoes what the user actually granted, which may be narrower than requested. Generation needs no scope — spending is bounded by the budget and expiry the user approved. There are no refresh tokens; re-run the flow when the key expires. Issued keys appear in the user's dashboard like any other API key and can be edited or revoked there at any time — revocation is immediate.

**Browser-only apps.** The same request works from `fetch`:

```javascript
const res = await fetch('https://enter.pollinations.ai/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,                                        // From the callback URL
    client_id: 'pk_yourkey',
    redirect_uri: 'https://myapp.com/callback',  // Exact registered URI
    code_verifier,                               // The verifier you saved
  }),
});
const { access_token } = await res.json();
```

Keep the token in memory, or `sessionStorage` if a callback page must hand it back within the same tab. Never put it in `localStorage`, a URL, analytics, or logs.

### 3. Call Pollinations

Use the returned `access_token` as the API key:

```javascript
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'yo' }] })
});
```

See `apps/oauth-client-demo/` for a zero-dependency server-backed reference
client and `apps/oauth-test/` for a browser-only reference.

## ⚙️ Legacy Web Apps (Fragment Flow)

The older BYOP redirect flow is still supported. It returns the user-authorized key directly in the URL fragment and does not use PKCE.

```text
https://enter.pollinations.ai/authorize?redirect_uri=https://myapp.com/callback&client_id=pk_yourkey&scope=usage
```

User comes back with the key in the URL fragment:

```text
https://myapp.com/callback#api_key=sk_abc123xyz
```

Fragment, not query param — never hits server logs. 🔒 If you passed `state`, it's echoed back: `#api_key=sk_...&state=...`. On denial the fragment is `#error=access_denied&state=...`.

### Code

```javascript
// Send user to auth
const params = new URLSearchParams({
  redirect_uri: location.href,
  client_id: 'pk_yourkey',
});
window.location.href = `https://enter.pollinations.ai/authorize?${params}`;

// Grab key from URL after redirect
const apiKey = new URLSearchParams(location.hash.slice(1)).get('api_key');

// Use their pollen
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'yo' }] })
});
```

## 🖥️ CLIs & Headless Apps (Device Flow)

Same authorize screen, but the user opens a browser separately. Your CLI polls for the key.

**Where this fits:**
- **Discord / Telegram / WhatsApp bots** — bot DMs the code, user approves in browser, bot gets their key
- **CLI tools** — `pollinations login` opens a browser, CLI waits for approval
- **MCP servers** — AI agent requests access, user approves from their browser
- **Raspberry Pi / IoT** — headless device displays a code, user approves on their phone
- **VS Code extensions** — extension shows the code, user approves in browser

```bash
# 1. request a device code (pass your app_key as client_id for attribution)
curl -X POST https://enter.pollinations.ai/api/device/code \
  -H 'Content-Type: application/json' \
  -d '{"client_id": "pk_yourkey"}'
# → { "device_code": "...", "user_code": "ABCD-1234", "verification_uri": "/device" }

# 2. tell user: "go to enter.pollinations.ai/device and enter ABCD-1234"

# 3. poll for the key (every 5s)
curl -X POST https://enter.pollinations.ai/api/device/token \
  -H 'Content-Type: application/json' \
  -d '{"device_code": "..."}'
# pending → { "error": "authorization_pending" }
# done    → { "access_token": "sk_...", "token_type": "bearer" }
```

The same device-code exchange is also available through the standard token endpoint:

```bash
curl -X POST https://enter.pollinations.ai/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:device_code' \
  -d 'device_code=...'
```

## 👤 Who's Using This Key?

Once you have the user-authorized `sk_...` key, you can check who it belongs to:

```bash
curl https://enter.pollinations.ai/api/device/userinfo \
  -H 'Authorization: Bearer sk_...'
# → { "sub": "user-id", "preferred_username": "voodoohop", "picture": "..." }
# with the `profile` scope, also: "name": "Thomas", "email": "..."
```

`/api/oauth/userinfo` returns the same standard OIDC userinfo shape. `name` and `email` are included only when the key carries the `profile` scope.

---

🕐 User-authorized keys default to 7 days. Users can revoke anytime from the dashboard.

[edit this doc](https://github.com/pollinations/pollinations/edit/main/BRING_YOUR_OWN_POLLEN.md) · *h/t [Puter.js](https://docs.puter.com/user-pays-model/) for the idea*

## Publish a Model

Publishing a model lets you connect an OpenAI-compatible endpoint to Pollinations and call it through `gen.pollinations.ai` under an `owner/model` id. Pollinations handles authentication, Pollen billing, model discovery, and routing; the model continues to run on infrastructure you control.

Model publishing and [connecting user wallets](./BRING_YOUR_OWN_POLLEN.md) solve different problems. Model publishing supplies a model to the Pollinations catalog. The wallet flow lets users authorize an app to spend their own Pollen. An app can use either or both.

## Supported Models

| Model family | Required upstream endpoint | Pollinations endpoint |
|---|---|---|
| Text | `POST /v1/chat/completions` | `POST /v1/chat/completions` |
| Image | `POST /v1/images/generations` | `GET /image/{prompt}` or `POST /v1/images/generations` |
| Image editing | `POST /v1/images/edits` in addition to image generation | `POST /v1/images/edits` |
| Speech to text | `POST /v1/audio/transcriptions` | `POST /v1/audio/transcriptions` |

Image providers must return `b64_json`. During testing, Pollinations checks whether an image provider supports edits and whether it reports OpenAI image-token usage.

Video, text-to-speech, embeddings, realtime, and 3D endpoints cannot currently be registered through this workflow.

## Private and Public Models

Any signed-in user can register and call a private model. Private models are owner-only, do not appear in the public catalog, and are free at the Pollinations layer.

Publishing a model requires account-level community publisher access while community model publishing is in alpha. Submit a [publisher access request](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml); the request enables public publishing for the account but does not register a model for you.

Public models appear in the model catalog and can be called by other Pollinations users. Owners set public pricing:

- Text models use the token categories reported by the upstream endpoint.
- Image models use per-token pricing when the registration test finds valid OpenAI image usage; otherwise they use a fixed price per generated image.
- Transcription models are priced from reported audio duration.
- A zero price makes the public model free.

Owners receive 75% of the Pollen spent on their models. Paid and Quest Pollen earnings remain in their respective wallet buckets. Cash payouts are not currently available.

## Register in the Dashboard

1. Open [My Models](https://enter.pollinations.ai/my-models).
2. Choose **Add model**.
3. Select text, image, or transcription and enter the upstream base URL, model id, and bearer token.
4. Fetch the upstream model list or run the endpoint test before saving.
5. Save the model as private, then call its `owner/model` id through the normal Pollinations endpoint.
6. If your account has publisher access, change visibility to public and set prices when it is ready for other users.

The upstream credential is used by Pollinations to proxy requests to your endpoint. Do not place it in a model name, description, public URL, or example.

## Register with the CLI

The CLI manages text, image, and transcription model registrations. Sign in, test the endpoint, then create the model:

```bash
npx @pollinations/cli auth login

npx @pollinations/cli my-models test \
  --modality image \
  --base-url https://api.example.com/v1 \
  --bearer-token "$UPSTREAM_API_KEY" \
  --model image-v1

npx @pollinations/cli my-models create \
  --name my-image \
  --title "My Image" \
  --modality image \
  --image-pricing request \
  --completion-image-price 0.01 \
  --input-modalities text,image \
  --base-url https://api.example.com/v1 \
  --bearer-token "$UPSTREAM_API_KEY" \
  --upstream-model image-v1
```

Use `polli my-models list`, `update`, and `delete` for the rest of the lifecycle. API keys used for model management require the `account:keys` permission.

## Publishing Controls

Public models support these owner controls in the dashboard or Account API:

- `paidOnly` restricts calls to Paid Pollen.
- `perUserRpm` limits each Pollinations user; `null` removes the limit.
- Text models can declare `advertised.contextLength` and the `tool_calling` or `reasoning` capabilities.
- The provider profile at `POST /account/my-models/provider` sets the public provider name and service URL shared by your models.
- Owners can hide or relist their models without deleting them.

Token prices cannot exceed 50 Pollen per 1M tokens. Fixed image prices cannot exceed 0.25 Pollen per image, and transcription prices cannot exceed 0.012 Pollen per minute. See the [Community Models API reference](https://gen.pollinations.ai/docs#tag/community-models) for the exact fields.

## Call Your Model

Use the generated `owner/model` id anywhere the corresponding Pollinations endpoint accepts a model:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "owner/my-model",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Authenticated model-list requests include your own private models. Public discovery endpoints accept `community=true` to return only community models.

## Fallbacks and Health

Public and private community models can nominate up to three compatible community fallbacks. Fallbacks are tried in order and must use the same model family. They must not cost more than the primary model; image fallbacks must also match its pricing mode and support image input when the primary model does. A fallback cannot require Paid Pollen unless the primary model does too.

Pollinations monitors public text and image models using live traffic and active probes. Sustained failures can hide a model from listings while exact-ID calls continue to work. Owners can relist a fixed model, and the monitor can automatically relist models it hid after recovery is verified. View public model health at [model-monitor.pollinations.ai](https://model-monitor.pollinations.ai).

## Trust Boundary

Community models run on the owner's infrastructure, not Pollinations infrastructure. Prompts, input media, and other request content are sent to that upstream provider. Do not send credentials or sensitive information to a community model unless you trust its owner and data handling.

For complete `/account/my-models` request and response schemas, use the [Community Models API reference](https://gen.pollinations.ai/docs#tag/community-models).

## Publish an Agent

Publishing an agent creates a managed agent that turns a system prompt, a Pollinations base model, and optional Pollinations tools into a reusable text model. Pollinations runs the agent for you, so you do not need to host an agent server.

This is different from hosting your own OpenAI-compatible model endpoint. It is also different from [connecting user wallets](./BRING_YOUR_OWN_POLLEN.md), which lets an app ask its users to pay for their own generations.

## Create an agent in the dashboard

1. Open [My Models](https://enter.pollinations.ai/my-models).
2. Add an agent and choose its name, title, visibility, system prompt, and base model.
3. Optionally enable Pollinations tools so the agent can generate media, call other models, and inspect the model catalog.
4. Save it. The dashboard creates the agent configuration and registers its callable model name.

A linked GitHub username is required to create an agent. Private agents are visible and callable only by their owner. Publishing an agent for everyone requires [community publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml).

## Agent configuration

An agent combines catalog fields with its runtime configuration:

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Callable model name used in `<github-username>/<name>`. |
| `title` | Yes | Display title shown in the model catalog. |
| `description` | No | Catalog description. |
| `visibility` | No | `private` by default, or `public` with publisher access. |
| `systemPrompt` | Yes | Instructions for the agent, from 1 to 8,000 characters. |
| `baseModel` | Yes | A text model ID from [`GET /v1/models`](https://gen.pollinations.ai/v1/models). |
| `mcpServers` | No | `[]` or `["pollinations"]` to enable the built-in Pollinations tools. |

Example `agent.json`:

```json
{
  "systemPrompt": "You are a concise research assistant. Cite the sources you use.",
  "baseModel": "openai",
  "mcpServers": ["pollinations"]
}
```

Updates replace the runtime configuration, so include `systemPrompt` and `baseModel`; include `mcpServers` if tools should remain enabled. You can also change the name, title, description, or visibility.

## Create with the CLI

Create the agent and its callable model listing in one command:

```bash
npx @pollinations/cli agents create \
  --config agent.json \
  --name research-assistant \
  --title "Research Assistant"
```

The callable model ID is `<your-github-username>/research-assistant`. Add `--visibility public` to publish it after your account has community publisher access. Managed agents are always text-only and free: they cannot set prices, fallbacks, or a per-user request limit.

## Call an agent

Once registered, call the agent exactly like any other text model:

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-github-username/research-assistant",
    "messages": [{"role": "user", "content": "Summarize this topic."}]
  }'
```

The agent listing itself has no owner-set price. The caller still pays for the selected base model and for any generations performed by tools. The catalog presents the base model's pricing and capabilities, plus the capabilities enabled by the agent's tools.

## Manage the lifecycle

```bash
npx @pollinations/cli agents list
npx @pollinations/cli agents get <agent-id>
npx @pollinations/cli agents update <agent-id> --config agent.json
npx @pollinations/cli agents delete <agent-id>
```

Deleting an agent also deletes its model listing. Updating an agent can change its prompt, base model, tools, name, title, description, or visibility.

The Account API exposes the same operations under `/account/agents`. API keys need the `account:keys` permission. See the [Community Agents API reference](https://gen.pollinations.ai/docs#tag/community-agents) for request and response schemas.

## CLI

The Pollinations CLI — for humans, AI agents, and everything in between.

Generate text, images, audio, video from the terminal. Backed by the [Pollinations API](https://gen.pollinations.ai).

<video src="https://github.com/user-attachments/assets/c3ff5c45-672c-4c45-9027-7743d32f9785" controls muted loop playsinline width="720">
  <a href="https://github.com/user-attachments/assets/c3ff5c45-672c-4c45-9027-7743d32f9785">▶️ Watch the demo</a>
</video>

```bash
npx @pollinations/cli gen image "a cat in space" --output cat.png
```

## For AI agents

Point your coding agent (Claude Code, Cursor, Windsurf, Codex) at the skill file and it gets the full usage map — flags, stdin conventions, `--json` output shape, error codes, the lot:

> Read https://raw.githubusercontent.com/pollinations/pollinations/main/packages/polli-cli/SKILL.md and follow the instructions to generate media with the `polli` CLI.

The skill also ships inside the package: `node_modules/@pollinations/cli/SKILL.md`.

Every command is agent-friendly:

- `--json` — structured stdout, human messages to stderr. Safe to parse.
- Exit code `0` on success, non-zero on error.
- When a call runs out of pollen, the first line of the error is the top-up link.
- `polli auth status --json` exposes everything about the current session.

## Get started

```bash
npm install -g @pollinations/cli     # installs the `polli` binary
polli auth login                         # device-flow via enter.pollinations.ai
printf '%s' "$POLLINATIONS_API_KEY" | polli auth login --with-token
```

Credentials land at `~/.pollinations/credentials.json`. For one-off runs pass `--key sk_...` or set `POLLINATIONS_API_KEY`. Get keys at [enter.pollinations.ai](https://enter.pollinations.ai/keys).

## Generate

```bash
polli gen text "Explain quantum tunneling in one sentence"
polli gen text "Summarize this" < notes.md          # stdin becomes context
echo "context" | polli gen text "question"

polli gen image "cyberpunk city at night" --model flux --output city.png
polli gen image "enhance this" --image https://media.pollinations.ai/abc --model gptimage

polli gen audio "Hello world" --voice nova --output speech.mp3
polli gen audio "read it to me" --play                # plays back after saving (blocks until done)
polli gen video "a waterfall in slow motion" --duration 5 --output clip.mp4
polli gen transcribe speech.mp3

polli gen chat --model openai                         # interactive multi-turn
```

`gen text` streams by default. File-output commands pick a sensible default path if `--output` is omitted.

## Discover

```bash
polli models                 # all models
polli models --type image    # filter
polli models --stats         # health + perf (last 60m)
polli docs                   # full API reference in the terminal
polli docs /image            # one endpoint
polli docs --open            # open in browser
polli quests                 # public quest catalog
polli quests --claimed       # already-completed and earned quest status
```

## Account

Two kinds of keys:

- **Secret (`sk_`)** — backend use, full access. Default.
- **Publishable (`pk_`)** — safe to ship in frontend code.

```bash
polli keys list
polli keys create --name mybot --budget 100                    # secret (default)
polli keys create --name myapp --type publishable              # API publishable
polli keys create --name myapp --type publishable \            # 3rd-party app key
  --redirect-uri https://myapp.com/callback --earnings
polli keys revoke <id>
```

Keys can't be edited — to change a name, budget, or model list, revoke and recreate. Publishable app keys default developer earnings off; pass `--earnings` to enable them.

```bash
polli usage                  # pollen balance
polli usage --history        # recent requests
polli usage --daily          # daily spend
polli earnings               # developer earnings (default 30 days, --days up to 90)
polli quests --claimable     # only rewards ready to claim
polli agents list            # managed prompt agents
polli my-models list         # invite-only community text, image, and transcription models
```

Manage agents with API-shaped JSON config files plus their callable model name
and catalog title:

```bash
polli agents get <id>
polli agents create --config agent.json --name my-agent --title "My Agent"
polli agents update <id> --config agent.json
polli agents delete <id>
```

`agent.json` contains the complete configuration:

```json
{
  "systemPrompt": "You are a concise research assistant.",
  "baseModel": "openai",
  "mcpServers": ["pollinations"]
}
```

Creating an agent also creates its callable model listing. See [Publish an Agent](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md) for visibility, billing, and lifecycle details.

`polli auth login` creates a key with all account permissions Polli needs: `profile`, `usage`, and `keys`. Use `account:usage` for narrow read-only account state like usage and quests. Use `account:keys` to manage keys and, where invite-only My Models access is enabled, my-models. Quest claiming remains in the dashboard.

## Links

- [gen.pollinations.ai](https://gen.pollinations.ai) — API
- [enter.pollinations.ai](https://enter.pollinations.ai) — dashboard, keys, billing
- [API docs](https://gen.pollinations.ai/docs)
- [Source](https://github.com/pollinations/pollinations/tree/main/packages/polli-cli)
- [Discord](https://discord.gg/pollinations-ai-885844321461485618)

## License

MIT

## MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for pollinations.ai. Lets MCP-capable hosts (Claude Desktop, Cursor, Windsurf, …) generate text, images, video, audio, embeddings, and 3D models; inspect model health; and check Pollen balance.

All calls go through `https://gen.pollinations.ai` by default. Set `POLLINATIONS_BASE_URL` to use another compatible gateway. Models, voices, and pricing are read live from the registry — no hardcoded enums.

## Quick Start

For Streamable HTTP clients, connect to `https://mcp.pollinations.ai` and send
your API key as `Authorization: Bearer YOUR_KEY`.

Other Pollinations-hosted MCP servers are listed at
[`https://gen.pollinations.ai/mcp`](https://gen.pollinations.ai/mcp). Connect to
an entry's URL with the same authorization header.

The server can only use models and account features allowed by that key's
permissions, and it cannot spend beyond the key's budget. Configure both in
[API key settings](https://enter.pollinations.ai/keys); see
[Authentication](https://gen.pollinations.ai/docs#tag/-authentication).

Or run the server locally over stdio:

```bash
# Run directly with npx (no installation required)
npx @pollinations/mcp
```

Or install globally:

```bash
npm install -g @pollinations/mcp
pollinations-mcp
```

## Authentication

Get your API key at [enter.pollinations.ai](https://enter.pollinations.ai/keys), or use [BYOP](../../BRING_YOUR_OWN_POLLEN.md) to let users bring their own pollen (supports web redirects and [device flow](../../BRING_YOUR_OWN_POLLEN.md#clis--headless-apps-device-flow) for CLIs).

**Key types:**

- `pk_` (publishable) — client-safe, rate-limited (1 pollen per IP per hour)
- `sk_` (secret) — server-side only, no rate limits, can spend Pollen

For the local server, set your key via environment variable or the `setApiKey`
tool:

```bash
export POLLINATIONS_API_KEY=sk_your_key_here
npx @pollinations/mcp
```

To use a local or self-hosted compatible gateway:

```bash
export POLLINATIONS_BASE_URL=http://localhost:8788
npx @pollinations/mcp
```

## Available Tools

### Media Generation

| Tool            | API route                | MCP result         |
| --------------- | ------------------------ | ------------------ |
| `generateImage` | `/v1/images/generations` | Image resource link |
| `generateVideo` | `/video/{prompt}`        | Video resource link |
| `generate3D`    | `/3d/{prompt}`           | GLB resource link   |

Generated media is uploaded unlisted to `media.pollinations.ai` and returned as an MCP resource link, so binary data does not consume model context. Anyone with the unguessable URL can access it; uploads use the media service's 30-day lifecycle. To edit an image, pass its HTTP(S) URL in `image`. Generate multiple images with multiple tool calls rather than a separate batch contract.

### Text Generation

| Tool               | API route              | Description                                      |
| ------------------ | ---------------------- | ------------------------------------------------ |
| `generateText`     | `/v1/chat/completions` | Text, search, multimodal input, and tool calling |
| `createEmbeddings` | `/v1/embeddings`       | Text or multimodal vector embeddings             |

Use `generateText` with the appropriate model and message content for simple text, web search, image/video analysis, and tool calling.

### Audio

| Tool              | API route                 | Description                            |
| ----------------- | ------------------------- | -------------------------------------- |
| `generateAudio`   | `/audio/{text}`           | Generate speech, music, or sound       |
| `transcribeAudio` | `/v1/audio/transcriptions` | Transcribe audio from a public HTTPS URL |

`generateAudio` returns an unlisted media resource link. `transcribeAudio` accepts a directly accessible audio URL and returns text. Call `listModels` with `type=audio` for live model and voice metadata.

### Discovery

| Tool             | API route              | Description                                  |
| ---------------- | ---------------------- | -------------------------------------------- |
| `listModels`     | Modality model routes  | Live models, capabilities, voices and pricing |
| `getModelStatus` | `/v1/models/status`    | Recent request counts, errors and latency    |

### Auth Tools

| Tool          | Description                          |
| ------------- | ------------------------------------ |
| `setApiKey`   | Set the API key for this session     |
| `getKeyInfo`  | Check stored key type/prefix (local) |
| `clearApiKey` | Remove the stored key                |

### Account

| Tool         | Description                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| `getBalance` | Remaining Pollen for the authenticated key (requires `account:usage`)        |

## Claude Desktop Integration

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "pollinations": {
      "command": "npx",
      "args": ["@pollinations/mcp"],
      "env": {
        "POLLINATIONS_API_KEY": "sk_your_key_here"
      }
    }
  }
}
```

## Examples

```text
Generate an image of a sunset over mountains using the flux model.

Create a 6-second video of waves crashing on a beach using veo.

Have a conversation about the weather with `generateText`, with the ability to call a weather API.

Generate audio saying "Hello, welcome to pollinations.ai!" using the nova voice.
```

## Testing

```bash
POLLINATIONS_API_KEY=sk_… npm run test
```

Without an API key, this runs an offline smoke test of the stdio connection, tool registration, and unauthenticated model listing through a local registry stub. With `POLLINATIONS_API_KEY`, it also exercises a small live slice (models, auth, chat, image URL, balance).

## Deployment (Hosted Worker)

The hosted MCP server at `mcp.pollinations.ai` is a Cloudflare Worker
defined in [`apps/mcp/`](../../apps/mcp/). It is deployed automatically
by the
[`Deploy / Applications`](../../.github/workflows/deploy-applications.yml)
workflow.

**How it works:**

1. A push to the `production` branch touching `apps/**` or
   `packages/mcp/**` triggers the workflow.
2. [`operations/deployment/discover.cjs`](../../operations/deployment/discover.cjs)
   scans for `apps/*/deploy.json` manifests and matches changed files
   against each app's path and `watch` globs.
3. [`apps/mcp/deploy.json`](../../apps/mcp/deploy.json) declares
   `"watch": ["packages/mcp/**"]`, so changes to the SDK source in
   `packages/mcp/` are detected even though the worker entry point
   lives in `apps/mcp/`.
4. [`operations/deployment/deploy.sh`](../../operations/deployment/deploy.sh)
   reads the manifest and runs `npm ci`, the test suite
   (`node --test worker.test.js`), and `wrangler deploy`.
5. [`apps/mcp/wrangler.jsonc`](../../apps/mcp/wrangler.jsonc) routes
   traffic to `mcp.pollinations.ai` and `mcp.myceli.ai`.

**Production gating:** the workflow only runs on `production`, and
[`guard-production-source.yml`](../../.github/workflows/guard-production-source.yml)
prevents PRs to `production` from branches other than `main`.

**Staging:** there is no separate staging deploy for the MCP worker.
Because the worker is a thin proxy to `gen.pollinations.ai`, staging
is handled at the gateway level (see `deploy-cloudflare-production.yml`), not
at the MCP layer.

**Manual deploy:** use `workflow_dispatch` on the Actions tab to
redeploy without a code change (select `mcp` or `all`).

## System Requirements

- Node.js 20.0.0 or higher

## API Reference

All requests go through `POLLINATIONS_BASE_URL`, which defaults to `https://gen.pollinations.ai`. Full API docs: [gen.pollinations.ai/docs](https://gen.pollinations.ai/docs).

## License

MIT

## Links

- [pollinations.ai](https://pollinations.ai)
- [API Documentation](https://gen.pollinations.ai/docs)
- [GitHub Issues](https://github.com/pollinations/pollinations/issues)