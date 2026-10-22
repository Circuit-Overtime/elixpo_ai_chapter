# Privacy Policy

_Last updated: August 31, 2026_

LixBlogs is a blogging platform operated by **Elixpo (Ayushman Bhattacharya)**. This policy explains the information LixBlogs processes, why it is used, when it is shared, and the choices available to you. Questions can be sent to **hello@elixpo.com**.

## Scope

This policy applies to LixBlogs websites, applications, and platform features. Connected services such as Elixpo Accounts, Cloudinary, Pollinations, LixRL, and Elixpo Pay have their own privacy policies for processing they perform independently.

## Information we process

### Account and profile information

Sign-in is provided by **Elixpo Accounts** using OAuth. LixBlogs receives your account identifier, username, display name, email address, avatar, and relevant account status. We do not receive or store your Elixpo Accounts password.

### Content and collaboration

We process stories, drafts, titles, subtitles, slugs, topics, media references, comments, reactions, collections, organization records, invitations, collaborator changes, and publishing settings. Drafts and collaboration data are processed so authorized editors can save and synchronize their work.

### Usage and analytics

We record actions needed to operate feeds and creator analytics, including views, reading progress, completion, likes, claps, bookmarks, follows, reposts, shares, referral source, campaign parameters, broad device category, and country code. Visitor identifiers are privacy-safe hashes used for deduplication and audience measurement; raw IP addresses are not exposed in creator analytics.

### Technical and security information

We process session identifiers, request timestamps, browser or device information, approximate sign-in location supplied by infrastructure, error details, and abuse-prevention signals. Session data is stored in an `httpOnly`, `Secure`, `SameSite=Lax` cookie in production and is not readable by page JavaScript.

### Billing information

When you upgrade, LixBlogs sends the plan, regional price context, and account information required to start checkout with **Elixpo Pay**. Payment credentials are entered with the payment service and are not stored by LixBlogs.

## How we use information

We use information to:

- authenticate accounts and maintain sessions;
- save, publish, render, search, and distribute content;
- provide collaboration, notifications, moderation, organizations, and collections;
- personalize feeds and recommendations;
- calculate creator analytics and platform limits;
- process subscriptions and enforce plan entitlements;
- compress, store, deliver, replace, and delete media;
- prevent abuse, investigate failures, and protect the service;
- send service messages such as account alerts, invitations, and optional digests.

We do not sell personal information or place third-party advertising trackers inside creator content.

## Media processing

Supported uploads are optimized and converted where appropriate. Image metadata such as EXIF, GPS, XMP, and IPTC is removed before storage. Published media is delivered through public HTTPS URLs and should not contain confidential information.

Media may be stored in the LixBlogs-managed Cloudinary environment or, when you enable it, your own Cloudinary product environment. LixBlogs tracks the provider, product-environment name, asset identifier, secure URL, type, size, owner, and associated story so storage usage and deletion can work correctly.

## Connected services

### Personal Cloudinary

When you connect Cloudinary, Cloudinary returns OAuth access and refresh tokens and identifies the product environment you selected. LixBlogs requests OpenID, Offline Access, Asset Management, and Upload permissions. Tokens are encrypted before database storage and are used to upload or delete LixBlogs media and refresh authorization. LixBlogs does not receive your Cloudinary password or API secret through OAuth.

Cloudinary receives media bytes, the destination folder and asset identifier, and technical request data. Switching storage providers affects new uploads only. Before disconnecting, you must delete LixBlogs-tracked media still owned by the personal environment. On disconnect, LixBlogs attempts to revoke the refresh token and deletes its connection record.

### LixRL

When you connect LixRL, LixBlogs sends your Elixpo Accounts identifier, email, display name, and avatar to match or provision the connected LixRL account. When you request a short link, the destination URL and optional title are sent to LixRL. LixBlogs uses a server-to-server integration credential; it does not store a personal LixRL API key in your profile.

Disconnecting prevents new shortening requests from LixBlogs. Existing short links remain stored and active in LixRL until you manage them there.

### Pollinations

When you connect Pollinations, LixBlogs uses OAuth authorization code with PKCE to receive a temporary provider key restricted by the models, Pollen budget, expiry, and usage access you approve. The key is encrypted before database storage and is never returned to the browser or CLI. LixBlogs stores a non-secret fingerprint, connection status, permitted models, expiry, balance and usage summary, generation attempt identifier, outcome, provider status, and duration. Prompts and generated image bytes are not stored in the generation audit table.

Pollinations receives the image prompt, selected model, dimensions, seed, optional reference image, and technical request data. A completed image is passed into the normal Cloudinary media pipeline. Disconnecting deletes the LixBlogs connection; provider-side revocation is managed in Pollinations, while images already copied to Cloudinary remain until deleted there through LixBlogs.

## Service providers and data locations

LixBlogs uses:

- **Cloudflare D1 and KV** for database records and caching;
- **Cloudflare Pages and Workers** for application delivery and collaboration services;
- **Cloudinary** for platform-managed or creator-authorized media storage and delivery;
- **Elixpo Accounts** for identity;
- **LixRL** when you connect short-link features;
- **Pollinations** when you connect user-funded image generation;
- **Elixpo Pay and its payment providers** when you start a paid checkout.

These services may process data in countries other than yours under their own infrastructure and legal obligations.

## Retention and deletion

We retain account information and content while your account is active or as needed to provide the service. You can delete individual content and media from their available controls. Deletion triggers removal from active platform records and attempts provider-side media deletion; caches, logs, backups, legal records, and independently retained connected-service data may take longer to expire.

Account deletion or app revocation is handled through [Elixpo Accounts Connected Apps](https://accounts.elixpo.com/dashboard/services). LixBlogs then removes the associated platform data through its revocation process, subject to records we must retain for security, fraud prevention, billing, or legal compliance.

## Your choices

You can:

- edit or delete your profile, content, comments, and media through available controls;
- choose story visibility and which creator badges appear publicly;
- change notification preferences;
- switch media storage providers or disconnect integrations;
- manage or revoke connected applications in Elixpo Accounts and provider dashboards;
- request information or assistance by emailing **hello@elixpo.com**.

## Security

We use access controls, scoped authorization, encrypted integration credentials, HTTPS, signed sessions, and provider token revocation. No service can guarantee absolute security. Report a suspected vulnerability privately to **hello@elixpo.com** rather than posting credentials or personal data in a public issue.

## Children

LixBlogs is not directed to children who cannot legally consent to online services in their jurisdiction. If you believe a child has provided personal information without appropriate consent, contact us.

## Changes to this policy

We may update this policy as the product or its providers change. The date at the top identifies the latest revision. Material changes may also be communicated through the service.

## Contact

- Privacy and data questions: **hello@elixpo.com**
- Product issues without sensitive information: [LixBlogs issue tracker](https://github.com/elixpo/blogs.elixpo/issues/new)
