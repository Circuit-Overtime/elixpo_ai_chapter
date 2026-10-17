> Generate text, images, video, audio, realtime voice, and embeddings with a single API. OpenAI-compatible — use any OpenAI SDK by changing the base URL.

**Base URL:** `https://gen.pollinations.ai`

**Get your API key:** [enter.pollinations.ai](https://enter.pollinations.ai/keys)

**Integration guides:** [BYOP, CLI, MCP Server](/docs/guides)

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
curl "https://gen.pollinations.ai/3d/no_prompt_for_trellis_needed?image=https://inferenceport.ai/img/trellis.jpg&model=trellis-2-low" \
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
| App Key (BYOP) | `pk_` | Client-side & Frontend apps | None | Publishable key used in the **BYOP (Bring Your Own Pollen)** flow to authorize users' balances. |

> **Note:** Publishable Keys (`pk_`) for direct client-side requests have been replaced by the **BYOP (Bring Your Own Pollen)** auth flow. Frontend applications should use the OAuth authorization-code flow with PKCE to obtain a temporary user-authorized secret key (`sk_`). The legacy fragment redirect and device flow remain supported.

Two ways to authenticate generation requests:

- Header: `Authorization: Bearer YOUR_API_KEY`
- Query param: `?key=YOUR_API_KEY`

For detailed integration guides on user-pays authorization, including OAuth discovery and token exchange, refer to the [Bring Your Own Pollen (BYOP) guide](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md).

## Text Generation

Generate text responses using AI models. Fully compatible with the OpenAI Chat Completions API — use any OpenAI SDK by changing the base URL.

| Endpoint | Best for |
|----------|----------|
| `POST /v1/chat/completions` | Full OpenAI compatibility — streaming, tools, vision, structured outputs |
| `GET /text/{prompt}` | Quick prototyping — simple GET, returns plain text |

**Available models:** openai, openai-fast, gpt-oss, gpt-5.4, gpt-5.4-mini, openai-large, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, mercury, command-a-plus, qwen-coder, mistral-small-3.2, mistral, openai-audio, openai-audio-large, gemini-3-flash, gemini, gemini-flash-lite-3.5, gemini-fast, deepseek, gemma, gemma-4-31b, deepseek-pro, grok, grok-4-20-reasoning, grok-large, grok-4.5, gemini-search, gemini-search-fast, gemini-search-large, midijourney, midijourney-large, claude-fast, claude, claude-sonnet-5, claude-opus-4.6, claude-opus-4.7, claude-large, claude-fable-5, perplexity-fast, perplexity-high, perplexity, perplexity-reasoning, kimi, kimi-code, kimi-k3, laguna, longcat, inkling, nemotron, mimo-v2.5, mimo-v2.5-pro, gemini-large, nova-fast, nova, glm, llama, llama-maverick, llama-scout, minimax-m2.7, minimax, muse-spark-1.1, mistral-large, qwen-coder-large, qwen-large, qwen3.7-max, qwen3.7-flash, qwen-vision, qwen-vision-pro, step-flash, step-3.5-flash, qwen-safety

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

**Available models:** dreamshaper, kontext, nanobanana, nanobanana-2, nanobanana-2-lite, nanobanana-pro, seedream5, seedream5-pro, seedream, seedream-pro, ideogram-v4-turbo, ideogram-v4-balanced, ideogram-v4-quality, gptimage, gptimage-large, gpt-image-2, flux, zimage, wan-image, wan-image-pro, qwen-image, grok-imagine, grok-imagine-pro, recraft-v4.1-vector, klein, p-image, p-image-edit, nova-canvas

### Community image models

Community image models use an owner/model id and support generation through `/image/{prompt}` and `/v1/images/generations`. The registration test adds image input and `/v1/images/edits` metadata when the registrant's edit endpoint succeeds. OpenAI-compatible responses use `b64_json`; URL responses are not supported for community models. See `/image/models` for the live model list and supported endpoints.

## Video Generation

Generate videos from text prompts or reference images. Returns MP4.

```
https://gen.pollinations.ai/video/sunset%20timelapse?model=veo&duration=4
```

**Available models:** veo, veo-1080p, seedance-pro, seedance-2.0, wan, wan-fast, wan-pro, wan-pro-1080p, grok-video-pro, happyhorse-1.1, p-video-720p, p-video-1080p, nova-reel

## Realtime Voice

OpenAI-compatible Realtime WebSocket proxy for voice and multimodal sessions.

| Endpoint | Description |
|----------|-------------|
| `GET /v1/realtime` | WebSocket Realtime session (`model=gpt-realtime-2.1`) |

Requires an API key with positive balance. Server clients can use `Authorization: Bearer <key>`; browser WebSocket clients can use `?key=pk_...`.

The WebSocket proxy aggregates observed `response.done` usage and settles one billing event when the session closes. Input transcription sessions are not supported yet.

Events sent and received over the socket use the OpenAI Realtime protocol unchanged. See OpenAI's [Realtime WebSocket events guide](https://developers.openai.com/api/docs/guides/realtime-websocket#sending-and-receiving-events).

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

**Realtime models:** gpt-realtime-2.1, gpt-realtime-2.1-mini, gpt-realtime-2

## 3D Generation

Generate 3D models from text prompts and images via a simple GET request.
Returns glTF Binary in GLB format. Depending on the model, certain models
ignore text inputs — any text prompt passed to the Trellis 2 family will be
ignored; only the image URL is used.

https://gen.pollinations.ai/3d/no_prompt_for_trellis_needed?model=trellis-2-low&key=YOUR_KEY_HERE&image=IMAGE_URL_HERE

**Available models:** trellis-2-low, trellis-2-medium, trellis-2-high, hyper3d-rodin

> **Note:** `hyper3d-rodin` requires Paid Pollen. `trellis-2-low` (the default),
> `trellis-2-medium`, and `trellis-2-high` work with Quest Pollen.

## Audio Generation

Text-to-speech, music generation, and audio transcription.

| Endpoint | Description |
|----------|-------------|
| `GET /audio/{text}` | Simple URL-based TTS or music generation |
| `POST /v1/audio/speech` | OpenAI-compatible TTS |
| `POST /v1/audio/transcriptions` | Speech-to-text transcription |

**Audio models:** elevenlabs, elevenflash, eleven-multilingual-v2, eleven-dialogue, eleven-voice-changer, eleven-voice-isolator, elevenmusic, lyria-3-clip, eleven-sfx, whisper, scribe, universal-2, universal-3.5-pro, stable-audio-3-medium, stable-audio-3-large, qwen-tts, qwen-tts-instruct, csm-1b, kokoro

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
| `GET /audio/models` | Audio models with supported voices |
| `GET /embeddings/models` | Embedding models with supported modalities |
| `GET /3d/models` | 3D Generation models with supported modalities |

Rich model endpoints include `capabilities` for agentic/model traits:
`tool_calling`, `reasoning`, `web_search`, and `code_execution`.
Modalities, video frame controls, voices, and context length remain separate
structured fields.

## Community Models (Alpha)

Community models are user-owned, OpenAI-compatible text or image-generation endpoints proxied through `gen.pollinations.ai` under an `owner/model` id (e.g. `Spit-fires/LFM2.5-230M`). Text providers serve `/v1/chat/completions`; image providers serve `/v1/images/generations`. Any signed-in user can register a private, owner-only model. Publishing it in the public model catalog requires allowlist approval while the program is in alpha.

**Alpha stage**
- Inclusion is fairly permissive for now; expect that to tighten before official launch.
- Text and image generation models are supported now; audio and other modalities are planned next.
- Community image models are exposed through `/image/{prompt}` and `/v1/images/generations`. The registration test adds image input and `/v1/images/edits` metadata when the registrant's edit endpoint succeeds. OpenAI-compatible responses use `b64_json`.

**Pricing**
- Owners set prices when publishing; blank or zero means free.
- Text models are priced per token (entered per 1M tokens) for each usage bucket the endpoint reports.
- Image models bill in one of two modes, detected when the endpoint is tested at registration: endpoints that return OpenAI image token usage are priced per 1M tokens; all others charge a fixed price per generated image.

**Payouts**
- Owners currently earn 75% of the pollen spent on their model.
- Payouts are like-for-like: a request paid with paid pollen pays the owner in paid pollen; a request paid with quest pollen pays the owner in quest pollen. Quest pollen can't be cashed out — it can only be spent on non-paid models.
- Owners will be able to switch their model to paid-only.
- Dollar payouts are planned but not available yet (legal/compliance work in progress).
- Expect a trial period where pollen accumulates but can't be cashed out yet — this will likely start manually, inviting owners once they cross a pollen threshold.

**Policing & safety**
- Community models do **not** run on Pollinations infrastructure — they run on the owner's own backend. Don't send API keys or other sensitive data through them.
- A safety feature that auto-redacts private info before it's sent to community models is planned, likely on by default with an opt-out.
- Owners and users are encouraged to test each other's models — self-policing keeps the ecosystem honest.
- Models can be pulled (and repeat offenders potentially blocked) for instability or suspected abuse — e.g. silently changing prices or serving a different model than advertised.

**Automated health monitoring**
- An automated monitor currently checks community text models for error rate and latency. Models with sustained failures get deactivated automatically — no human involvement needed for that direction. Community image models are not monitored yet.
- Reactivating a deactivated model is manual and owner-only, from the dashboard. There's no auto-reactivation, so if your model was turned off, fix the underlying issue before reactivating it, or it may just fail again.
- Check your model's live health — request counts, success rate, errors, and latency — at [model-monitor.pollinations.ai/debug](https://model-monitor.pollinations.ai/debug).

To request account-level permission to publish community models, submit a [publisher allowlist request](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml). The form does not register individual models. Private models can be registered and called without approval under **Models → My Models** at [enter.pollinations.ai](https://enter.pollinations.ai); fetching upstream models, testing the upstream endpoint, and publishing require approval. Registration and management are also documented under the Account section of this reference. The dashboard and Account API support text and image models; the [CLI](/docs/guides/cli) (`polli my-models`) currently supports text models only.

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
| `GET /account/usage` | Per-request usage history with costs |
| `GET /account/usage/daily` | Daily aggregated usage for dashboards |
| `/account/my-models` | Private community model registration and allowlisted public publishing |
| `GET /account/key` | API key validity, type, and permissions |

### GET /account/profile

Returns user profile. `githubUsername`, `image`, and `communityEndpointsAllowed` are always included. `name` and `email` are included only when the API key has `account:profile`.

### GET /account/balance

Returns remaining pollen. If the API key has a budget, returns key budget instead. Full account balance requires `account:usage`.

### GET /account/quests

Returns the quest catalog with account status. `completed` includes both globally completed quests and quests earned by the account. Requires `account:usage`. Claiming rewards is dashboard-only.

### GET /account/usage

Per-request usage history: model, token counts, cost, response time. Requires `account:usage`.

### GET /account/usage/daily

Daily aggregated usage suitable for dashboards. Requires `account:usage`.

### GET /account/key

Returns the current API key's validity, type, and permissions.

### /account/my-models

Community text and image model management. Any authenticated account can list, create, update, delete, and call its private owner-only models. Text providers must expose OpenAI-compatible `/v1/chat/completions`; image providers must expose `/v1/images/generations`. Image models are text-to-image only, and calls through `/v1/images/generations` must use `response_format: "b64_json"`; reference images and edits are not supported yet. The endpoint test selects image pricing: valid OpenAI image token usage enables per-1M-token pricing, otherwise a fixed Pollen price is charged once per successful generated image.

Public publishing and the upstream inspection/test tools require `communityEndpointsAllowed: true`; [request account-level publisher access](https://github.com/pollinations/pollinations/issues/new?template=community-model-allowlist.yml) with the allowlist form. The form does not register individual models. API keys require `account:keys`. The dashboard and Account API support text and image registration; `polli my-models` currently supports text models only.

## Safety

Optional safety checking runs on text input before generation. Omitted, `false`, or `0` means off.

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
| `GET /v0/pipes/public_model_stats.json` | `limit` (50) | Per-model usage over the last 7 days: request count, avg cost, avg response time |
| `GET https://gen.pollinations.ai/v1/models/status` | `minutes` (60, max 10080) | Per-model health in a recent window: 2xx/4xx/5xx counts, latency p50/p95. Use this cached gateway instead of calling Tinybird directly. |
| `GET /v0/pipes/weekly_health_stats.json` | `weeks_back` (12) | Weekly service availability (`2xx / (2xx + 5xx)`, cache excluded) and latency |
| `GET /v0/pipes/app_top_weekly.json` | — | Top 10 registered apps owned by showcase contributors, by request count over the last 7 days. The owner is listed in the directory; the returned app may be any of their registered apps |
| `GET /v0/pipes/app_directory_public.json` | `category`, `platform`, `limit` (1000) | The community app directory ([apps/APPS.md](https://github.com/pollinations/pollinations/blob/main/apps/APPS.md)) |

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

## BYOP

BYOP (Bring Your Own Pollen) lets your users authorize your app to spend their own Pollen on Pollinations requests. Your publishable App Key (`pk_...`) identifies the app; after approval, Pollinations returns a scoped user key (`sk_...`) for API calls.

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

Validate `state`, then exchange the code from your server:

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

### 3. Call Pollinations

Use the returned `access_token` as the API key:

```javascript
fetch('https://gen.pollinations.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'yo' }] })
});
```

See `apps/oauth-client-demo/` for a zero-dependency reference client.

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
polli quests mine            # your completed and earned quest status
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
polli quests mine --completed # completed and earned quests
polli my-models list         # invite-only community text models
```

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

A [Model Context Protocol](https://modelcontextprotocol.io) server for pollinations.ai. Lets MCP-capable hosts (Claude Desktop, Cursor, Windsurf, …) generate images, videos, text, and audio, plus check the authenticated key's Pollen balance and usage.

All calls go through `https://gen.pollinations.ai`. Models, voices, and pricing are read live from the registry — no hardcoded enums.

## Quick Start

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

Set your key via environment variable or the `setApiKey` tool:

```bash
export POLLINATIONS_API_KEY=sk_your_key_here
npx @pollinations/mcp
```

## Available Tools

### Image & Video Generation

| Tool                 | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `generateImageUrl`   | Generate a shareable image URL from a text prompt          |
| `generateImage`      | Generate an image and return base64 data                   |
| `generateImageBatch` | Generate multiple images in parallel (best with `sk_` keys)|
| `generateVideo`      | Generate a video and return base64 data                    |
| `generateVideoUrl`   | Generate a shareable video URL from a text prompt          |
| `describeImage`      | Vision analysis of an image URL                            |
| `analyzeVideo`       | Analyze YouTube videos or video URLs                       |
| `listImageModels`    | List available image & video models (live)                 |

Common image parameters: `prompt`, `model`, `width`, `height`, `seed`, `quality`, `image` (for image-to-image), `transparent`. Common video parameters: `model`, `duration`, `aspectRatio`, `audio`. Call `listImageModels` for the current model set and per-model capabilities.

### Text Generation

| Tool             | Description                                       |
| ---------------- | ------------------------------------------------- |
| `generateText`   | Simple text generation from a prompt              |
| `chatCompletion` | OpenAI-compatible chat completions + tool calling |
| `webSearch`      | Web-grounded answers (perplexity, gemini-search)  |
| `listTextModels` | List available text models (live)                 |
| `getPricing`     | Per-model pricing (text / image / audio)          |

Call `listTextModels` for the current model set, aliases, and capabilities (reasoning, tools, audio output, etc.).

### Audio

| Tool               | Description                              |
| ------------------ | ---------------------------------------- |
| `respondAudio`     | AI responds to a prompt with speech      |
| `sayText`          | Text-to-speech (verbatim)                |
| `transcribeAudio`  | Transcribe audio (gemini-large)          |
| `listAudioVoices`  | List available voices (live)             |

Call `listAudioVoices` for the current voice list. Output formats: mp3, wav, flac, opus, pcm16.

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
| `getUsage`   | Per-request history, or daily aggregate when `daily: true` (`account:usage`) |

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

Have a chatCompletion conversation about the weather, with the ability to call a weather API.

Say "Hello, welcome to pollinations.ai!" using the nova voice.
```

## Testing

```bash
POLLINATIONS_API_KEY=sk_… npm run test
```

Spawns the server over stdio, lists tools, and exercises a small live slice (auth, text, image URL, balance). Skips authenticated calls when the env var is unset.

## System Requirements

- Node.js 18.0.0 or higher

## API Reference

All requests go through `https://gen.pollinations.ai`. Full API docs: [gen.pollinations.ai/docs](https://gen.pollinations.ai/docs).

## License

MIT

## Links

- [pollinations.ai](https://pollinations.ai)
- [API Documentation](https://gen.pollinations.ai/docs)
- [GitHub Issues](https://github.com/pollinations/pollinations/issues)