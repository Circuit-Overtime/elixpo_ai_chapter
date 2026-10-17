// Content/size limits, enforced at the API layer (SQLite can't).
// Caps protect the Cloudflare Worker memory budget (~128MB) and the DB.

export const MAX_REQUEST_BYTES = 4_000_000;        // hard cap on any mutating request body (~4 MB)
export const MAX_BLOG_CONTENT_BYTES = 1_500_000;   // serialized block-JSON per blog (~1.5 MB)
export const MAX_SUBPAGE_CONTENT_BYTES = 3_000_000; // canvas scenes can be larger (~3 MB)
export const MAX_TITLE_LEN = 300;
export const MAX_SUBTITLE_LEN = 500;
export const MAX_MEDIA_PER_BLOG = 100;             // image count per blog
export const MAX_BLOG_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB of images per blog (flat cap)
export const MAX_SUBPAGES_PER_BLOG = 2;            // doc sub-pages per blog (no nesting)
export const MAX_CANVAS_PER_BLOG = 2;              // canvas sub-pages per blog
export const MODERATION_AUTOHIDE_THRESHOLD = 5;    // distinct reporters → auto status='under_review'

export function byteLength(value) {
  if (value == null) return 0;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return new TextEncoder().encode(str).length;
}

// Early guard: reject oversized bodies via Content-Length BEFORE reading/parsing
// them into memory. Returns true if the request is too large to accept.
export function requestTooLarge(request, max = MAX_REQUEST_BYTES) {
  const len = parseInt(request.headers.get('content-length') || '0', 10);
  return Number.isFinite(len) && len > max;
}
