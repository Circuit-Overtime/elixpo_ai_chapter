## Start a draft

Choose **Write** from the navigation. LixBlogs saves your draft as you work. The editor supports headings, lists, quotes, code, tables, equations, images, embeds, and links through the slash menu and formatting toolbar.

The save indicator describes the current state:

- **Saving** means changes are being synchronized.
- **Saved** means the latest editor state reached LixBlogs.
- A collaboration warning means live presence is unavailable; local editing may still work.

## Prepare the story

Before publishing, review:

- **Title and subtitle** — used in the story page, feed previews, and search metadata.
- **Topics** — help readers and platform search discover the story.
- **Cover** — upload and crop an image, or keep the default cosmetic cover.
- **Slug** — the owner-controlled final part of the public URL.
- **Publication** — publish as yourself or an organization where you have permission.
- **Visibility** — public stories are discoverable; unlisted stories are excluded from normal discovery; secret stories are public by short-ID URL but cannot be connected to their author through LixBlogs surfaces.

The default cover is a visual placeholder and is not uploaded as creator media.

Secret mode protects the writer's identity; it is not a reader access control.
It can be selected while the story is a draft and is locked after first publish.
The API and CLI expose the same setting through the normal
`lixblogs:blog:write` permission.

## Publish and update

Choose **Publish** for a new story or **Update** for an existing one. A successful operation redirects to the canonical published URL, including when the only change was a topic, cover, icon, or publishing setting.

Public stories are included in the dynamic sitemap and expose story-specific metadata so search engines can index them. Indexing time is controlled by each search engine and is not immediate.

## Links and embeds

Paste an `https://` URL to create a link or supported embed. If [LixRL](/docs/lixrl) is connected, the link editor can replace a destination with an account-owned short URL before inserting it.
