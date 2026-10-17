# Pollinations image generation

LixBlogs can generate covers and inline images using your own Pollinations account. This is a BYOP connection: Pollinations charges the Pollen balance and budget you approve, while LixBlogs provides the editor and storage workflow.

No text-writing model is connected. Pollinations is used only when you explicitly request an image.

## Connect

1. Open **Settings → Integrations**.
2. Select **Connect Pollinations**.
3. Review the model list, seven-day expiry, Pollen budget, and read-only usage access on Pollinations.
4. Approve the connection and return to LixBlogs.

The authorization uses OAuth authorization code with PKCE. LixBlogs receives a temporary, restricted provider key after approval. The key is encrypted server-side, is never returned to the browser or CLI, and can be revoked from Pollinations at any time.

## Generate and store an image

In the editor, choose **Generate** for a cover or **AI Generate** in an image block. Generation is one explicit, billable attempt. LixBlogs does not automatically retry failed generations.

After generation, the image follows the normal media pipeline: it is optimized, stripped of metadata where supported, uploaded to your selected Cloudinary space, tracked against your storage allowance, and attached only when you choose to use it. A failed storage upload does not silently run another paid generation.

## Balance, limits, and errors

The integration card shows the provider account, remaining balance, approved budget, permitted models, expiry, and recent usage summary. Refresh it to verify a changed balance or provider-side revocation.

- **Insufficient Pollen**: top up or change the budget in Pollinations, then reconnect if required.
- **Permission denied**: the selected model is not included in the approved connection.
- **Expired or revoked**: reconnect from Settings.
- **Rate limited or unavailable**: retry manually later. LixBlogs will not repeat the charged request for you.

## CLI and agent workflows

The CLI uses the same server-side connection; it never reads or stores a Pollinations key:

```bash
lixblogs integrations pollinations-status --json
lixblogs media generate --prompt "A geometric night skyline" --model flux --output skyline.jpg
lixblogs media generate --prompt "A calm technical illustration" --blog BLOG_ID --type inline --attach --json --no-input
lixblogs media generate --prompt "Restyle this composition" --reference source.webp --output restyled.jpg
```

Keep the generated local file until the Cloudinary upload succeeds. If storage fails, upload that file with `lixblogs media upload` rather than paying for another generation.

## Disconnect

Disconnecting removes the encrypted connection from LixBlogs and stops new generations. For immediate provider-side revocation, also revoke the issued key in the Pollinations dashboard. Images already stored in Cloudinary remain until you delete them through Media controls or the CLI.
