// Canonical allowlist for image uploads. Mirrors @elixpo/lixsketch's
// utils/allowedImageTypes.js so that the engine, the canvas iframe, and the
// blog editor all enforce the same rule. Keep these in sync.
//
// Static raster + vector formats only. Animated GIF, HEIC, TIFF, video,
// audio, PDF, and arbitrary files are excluded.

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

export const IMAGE_ACCEPT_ATTR = ALLOWED_IMAGE_MIME_TYPES.join(',');

export function isAllowedImage(file) {
  if (!file) return false;
  const type = (file.type || '').toLowerCase();
  if (type && ALLOWED_IMAGE_MIME_TYPES.includes(type)) return true;
  const name = (file.name || '').toLowerCase();
  if (!name) return false;
  return ALLOWED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function isAllowedMime(mime) {
  if (!mime) return false;
  return ALLOWED_IMAGE_MIME_TYPES.includes(String(mime).toLowerCase());
}
