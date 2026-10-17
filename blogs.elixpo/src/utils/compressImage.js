/**
 * Compress an image file to WebP, targeting maxSizeKB.
 * Uses canvas with iterative quality reduction.
 *
 * PRIVACY — this function is also our only EXIF strip, and secret (anonymous) blogs
 * depend on it. The canvas round-trip (createImageBitmap → drawImage → convertToBlob)
 * re-encodes from raw pixels, so EXIF — including GPS coordinates — cannot survive it.
 * Nothing here is allowed to short-circuit that: do NOT add a "skip compression if the
 * file is already small" fast path that returns the original File, or a protest photo
 * will upload with the author's location attached. The server does not strip metadata
 * (Cloudinary keeps the original intact), so this is the last line of defence.
 *
 * @param {File|Blob} file - The image file to compress
 * @param {Object} opts
 * @param {number} [opts.maxSizeKB=200] - Target max size in KB (hard cap: 200KB)
 * @param {number} [opts.maxWidth=1920] - Max width in px
 * @param {number} [opts.maxHeight=1080] - Max height in px
 * @param {number} [opts.initialQuality=0.85] - Starting quality (0-1)
 * @param {number} [opts.minQuality=0.3] - Minimum quality before giving up
 * @returns {Promise<{blob: Blob, url: string, originalSize: number, compressedSize: number, quality: number}>}
 */
export async function compressImage(file, opts = {}) {
  const {
    maxSizeKB = 100,
    maxWidth = 1920,
    maxHeight = 1080,
    initialQuality = 0.85,
    minQuality = 0.3,
  } = opts;

  const maxBytes = maxSizeKB * 1024;
  const originalSize = file.size;

  // Load image
  const img = await createImageBitmap(file);
  let { width, height } = img;

  // Scale down if too large
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // Draw to canvas
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  // Try WebP first, then JPEG fallback
  const formats = ['image/webp', 'image/jpeg'];

  for (const format of formats) {
    let quality = initialQuality;

    while (quality >= minQuality) {
      const blob = await canvas.convertToBlob({ type: format, quality });

      if (blob.size <= maxBytes) {
        const url = URL.createObjectURL(blob);
        return { blob, url, originalSize, compressedSize: blob.size, quality, format };
      }

      // Reduce quality by 10%
      quality -= 0.1;
    }

    // If still too large at min quality, try reducing dimensions
    let scale = 0.8;
    while (scale >= 0.4) {
      const sw = Math.round(width * scale);
      const sh = Math.round(height * scale);
      const smallCanvas = new OffscreenCanvas(sw, sh);
      const smallCtx = smallCanvas.getContext('2d');
      smallCtx.drawImage(img, 0, 0, sw, sh);

      const blob = await smallCanvas.convertToBlob({ type: format, quality: minQuality + 0.1 });
      if (blob.size <= maxBytes) {
        const url = URL.createObjectURL(blob);
        return { blob, url, originalSize, compressedSize: blob.size, quality: minQuality + 0.1, format };
      }
      scale -= 0.1;
    }
  }

  // Last resort — return smallest we could get
  const finalBlob = await canvas.convertToBlob({ type: 'image/webp', quality: minQuality });
  const url = URL.createObjectURL(finalBlob);
  return { blob: finalBlob, url, originalSize, compressedSize: finalBlob.size, quality: minQuality, format: 'image/webp' };
}

/**
 * Compress a cover/banner image (wider aspect ratio, slightly larger allowed).
 */
export async function compressCoverImage(file) {
  return compressImage(file, {
    maxSizeKB: 150,
    maxWidth: 1920,
    maxHeight: 600,
    initialQuality: 0.82,
  });
}

/**
 * Compress an inline blog image.
 */
export async function compressBlogImage(file) {
  return compressImage(file, {
    maxSizeKB: 100,
    maxWidth: 1200,
    maxHeight: 900,
    initialQuality: 0.8,
  });
}
