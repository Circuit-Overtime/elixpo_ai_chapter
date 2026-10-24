---
name: lixblogs-media
description: Generate, upload, and attach LixBlogs images through the supported CLI. Use when an agent needs an inline image or cover stored in the creator's selected Cloudinary space, optionally generated through their connected Pollinations BYOP account.
---

# LixBlogs media

Use `@elixpo/lixblogs-cli` 1.5.0 or newer with `--json --no-input`. Never read integration keys, call Pollinations generation/account endpoints or Cloudinary directly, persist provider URLs, or use session cookies. The unauthenticated Pollinations image-model catalog is the only direct provider request allowed.

## Access and cost

- Inspect connection: `lixblogs:media:read`
- Generate or upload: `lixblogs:media:write`; attaching also needs `lixblogs:blog:read` and `lixblogs:blog:write`
- Pollinations generation spends the creator's approved Pollen budget. Generate only when the current user request explicitly authorizes that image. One command is one billable attempt; never automatically retry a failed generation.
- The approved models are `gptimage`, `flux`, and `klein`. Respect an explicit model choice. Otherwise choose the least costly approved model that supports the requested operation; do not assume that today's cheapest model will stay cheapest.
- A disconnected, expired, or revoked connection must be repaired by the user at `https://blogs.elixpo.com/settings?tab=integrations`.

Check the connection before offering generation:

```bash
lixblogs integrations pollinations-status --json --no-input
```

When no model was requested, inspect current public pricing and capabilities:

```bash
curl -fsSL https://gen.pollinations.ai/image/models
```

Compare only `gptimage`, `flux`, and `klein` using the catalog's declared image price. Exclude models that do not support the requested reference-image or sizing capability, then pass the cheapest remaining model explicitly with `--model`. This catalog request needs no key. If pricing or required capability metadata cannot be established, stop and ask the user to choose rather than initiating an uncertain billable request.

## Generate and attach

Keep `--output`: it retains a local recovery copy if Cloudinary persistence fails, so retry `media upload` instead of paying for another generation.

```bash
lixblogs media generate --prompt "Editorial illustration of…" --model flux --output image.jpg --json --no-input
lixblogs media generate --prompt "Wide cover…" --blog BLOG_ID --type cover --attach --output cover.jpg --json --no-input
lixblogs media generate --prompt "Diagram…" --blog BLOG_ID --type inline --caption "System flow" --attach --output diagram.jpg --json --no-input
lixblogs media generate --prompt "Restyle this reference…" --reference source.webp --blog BLOG_ID --type inline --attach --output result.jpg --json --no-input
```

Use a new generation only for a genuinely new explicit request. Duplicate submissions are rejected to prevent double spending. Do not retry `401`, `402`, `403`, or `429` responses automatically.

## Upload existing media

```bash
lixblogs media upload --file image.webp --blog BLOG_ID --type inline --caption "Alt context" --attach --json --no-input
lixblogs media upload --file cover.webp --blog BLOG_ID --type cover --attach --json --no-input
```

Uploads pass through LixBlogs metadata stripping, storage quotas, ownership checks, idempotent tracking, and the creator's selected global or personal Cloudinary space. Use a stable `--upload-id` when retrying the same local file.

After attachment, fetch the blog once and confirm the returned media URL appears in the intended cover or content block. Use `lixblogs-author` for placement or prose changes and `lixblogs-publish` for public-state changes.

Delete an owned tracked asset only with explicit approval:

```bash
lixblogs media delete MEDIA_ID --yes --json --no-input
```

Deletion removes the provider asset and its LixBlogs tracking record. If personal Cloudinary authorization has expired, ask the user to reconnect that storage space; never remove only the database record.
