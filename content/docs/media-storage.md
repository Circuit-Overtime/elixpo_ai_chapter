LixBlogs supports story covers and images inside the editor. Uploads are optimized before storage, tracked against the owning account or organization, and associated with the story that uses them.

## During an upload

The editor shows an uploading state while compression, transfer, and persistence are in progress. Wait for the permanent image and storage chip to appear before closing the page. Repeated upload requests use an upload identifier so retries do not create duplicate tracked assets.

## Storage spaces

Media can live in either:

- **LixBlogs storage** — the platform-managed Cloudinary environment, subject to your LixBlogs allowance.
- **Personal Cloudinary** — a product environment you authorize under **Settings → Integrations**.

The Media settings show tracked usage and the provider that owns each asset. Switching the active provider affects new uploads only; it does not move existing files.

## Replace and delete media

Replacing a stable cover updates that story's cover reference. Deleting an asset from Media removes the tracked file from its owning storage provider when possible. A personal Cloudinary connection cannot be removed while LixBlogs still tracks media stored there; delete those assets first.

Deleting a story also attempts to delete media associated exclusively with it. Copies, externally referenced assets, and files independently retained in a connected provider may require provider-side management.

## Privacy and metadata

Supported images are compressed and metadata such as EXIF, GPS, XMP, and IPTC is removed before upload. Avoid uploading confidential material: published story media is delivered through public HTTPS URLs.

For personal storage setup, see [Connect Cloudinary](/docs/cloudinary).
