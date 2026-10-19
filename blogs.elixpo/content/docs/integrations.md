Connected services add capabilities without requiring you to share a provider password with LixBlogs. Manage them from **Settings → Integrations**.

## Available integrations

| Service | Purpose | Authorization |
| --- | --- | --- |
| [Cloudinary](/docs/cloudinary) | Store new covers and editor images in your own product environment | Cloudinary OAuth |
| [LixRL](/docs/lixrl) | Create account-owned short links from the blog editor | Your Elixpo Accounts identity through the LixBlogs–LixRL service connection |
| [Pollinations](/docs/pollinations) | Generate covers and inline images using your own Pollen | OAuth authorization code with PKCE and a restricted, expiring BYOP key |

## Before connecting

Review the provider's terms, privacy policy, limits, and billing. A connected service remains a separate product: its availability and account limits are controlled by that provider.

## Disconnecting

Disconnecting stops new actions from LixBlogs. It does not automatically undo completed actions:

- Existing LixRL links remain active and manageable in LixRL.
- Media already uploaded to personal Cloudinary remains in that product environment and must stay connected while LixBlogs manages those tracked assets.
- Pollinations-generated images already copied to Cloudinary remain there; revoke the issued Pollinations key from its dashboard for immediate provider-side revocation.

See the [Privacy Policy](/privacy) for the data exchanged with each service.
