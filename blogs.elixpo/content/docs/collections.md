# Curated collections

Curated collections let you organize public LixBlogs stories around a subject, reading path, or editorial idea. A collection references the original post; it does not copy the post or transfer ownership.

## Create and share a collection

Open **Library → Collections**, create a collection, and add published posts by their blog ID. You can also choose **Add to a collection** from the interaction bar beneath any public post.

Collections begin as private. A collection can be:

- **Private** — visible only to its owner.
- **Unlisted** — available to anyone with its link but excluded from discovery.
- **Public** — shareable, indexable, and eligible for discovery.

Public and unlisted personal collections use `/<username>/reads/<collection-slug>`.

## Attribution and licenses

Every entry links to the post's canonical URL and displays its original author and license. Adding a post to a collection:

- does not copy its body;
- does not change its author, publication, canonical URL, or license;
- does not grant the curator permission to republish or sublicense it; and
- automatically disappears from public collection results if the post becomes private, secret, archived, trashed, or unpublished.

The default license for new stories is configured under **Settings → Publishing**. Existing stories retain the license saved on the story.

## Author controls

Writers can disable **Allow public curation** under **Settings → Publishing**. This blocks other users from adding their stories to new collections. A writer can remove their own story from a collection even when they do not own that collection.

## CLI automation

Collection reads use `lixblogs:blog:read`; mutations use `lixblogs:blog:write`.

```bash
lixblogs collection list
lixblogs collection create --title "Distributed systems reading" --visibility private
lixblogs collection add COLLECTION_ID --blog BLOG_ID --note "Start here"
lixblogs collection entries COLLECTION_ID
lixblogs collection edit COLLECTION_ID --visibility public
lixblogs collection remove COLLECTION_ID --blog BLOG_ID --yes
lixblogs collection delete COLLECTION_ID --yes
```

Use `--json --no-input` for workflows. Personal access tokens work without a browser session. Organization-scoped tokens cannot manage personal curated collections.
