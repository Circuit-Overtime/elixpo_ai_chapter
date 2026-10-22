/**
 * Canonical allowlist for image uploads across LixSketch and any embedding
 * host (e.g. blogs.elixpo). Anything not in this list is rejected at file
 * pick / paste / drop time and again at the server boundary.
 *
 * Static raster + vector formats only. Animated GIF is intentionally excluded
 * (animation isn't supported by the SVG renderer or the blog reader); HEIC,
 * TIFF, video, audio, PDF, and arbitrary files are excluded by omission.
 */

export const ALLOWED_IMAGE_MIME_TYPES = Object.freeze([
    'image/avif',
    'image/jpeg',
    'image/png',
    'image/bmp',
    'image/svg+xml',
    'image/webp',
]);

export const ALLOWED_IMAGE_EXTENSIONS = Object.freeze([
    '.avif',
    '.jpeg',
    '.jpg',
    '.png',
    '.bmp',
    '.svg',
    '.webp',
]);

/** Comma-joined value suitable for an <input accept="…"> attribute. */
export const IMAGE_ACCEPT_ATTR = ALLOWED_IMAGE_MIME_TYPES.join(',');

/**
 * Validate a File / Blob against the allowlist by mime type, falling back
 * to extension matching when the browser doesn't fill in `type` (some
 * drag-drop sources, some SVGs).
 */
export function isAllowedImage(file) {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    if (type && ALLOWED_IMAGE_MIME_TYPES.includes(type)) return true;
    const name = (file.name || '').toLowerCase();
    if (!name) return false;
    return ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Same check but for a base64 data URL (e.g. from clipboard paste). */
export function isAllowedImageDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') return false;
    const m = dataUrl.match(/^data:([^;]+);/i);
    if (!m) return false;
    return ALLOWED_IMAGE_MIME_TYPES.includes(m[1].toLowerCase());
}
