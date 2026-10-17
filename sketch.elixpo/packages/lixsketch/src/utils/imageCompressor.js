/**
 * Adaptive image compression utility.
 * Compresses images to reduce size while maintaining quality.
 * Uses JPEG for opaque images, PNG for transparent ones.
 */

const MAX_DIMENSION = 1920
const TARGET_SIZE_BYTES = 300 * 1024 // 300KB target
const MIN_QUALITY = 0.4

/**
 * Compress a data URL image adaptively.
 * @param {string} dataUrl - Base64 data URL of the image
 * @param {object} options
 * @param {number} options.maxWidth - Max width (default 1920)
 * @param {number} options.quality - Initial JPEG quality (default 0.8)
 * @returns {Promise<{dataUrl: string, blob: Blob, width: number, height: number, originalSize: number, compressedSize: number}>}
 */
export async function compressImage(dataUrl, { maxWidth = MAX_DIMENSION, quality = 0.8 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const originalSize = Math.ceil(dataUrl.length * 0.75) // approx bytes from base64

        // Calculate scaled dimensions
        let w = img.width
        let h = img.height
        if (w > maxWidth) {
          const ratio = maxWidth / w
          w = maxWidth
          h = Math.round(h * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)

        // Detect transparency
        const hasAlpha = detectAlpha(ctx, w, h)
        const mimeType = hasAlpha ? 'image/png' : 'image/jpeg'

        // For JPEG: adaptive quality to hit target size
        if (mimeType === 'image/jpeg') {
          let currentQuality = quality
          let result = canvas.toDataURL(mimeType, currentQuality)
          let resultSize = Math.ceil(result.length * 0.75)

          // Reduce quality iteratively if still too large
          while (resultSize > TARGET_SIZE_BYTES && currentQuality > MIN_QUALITY) {
            currentQuality -= 0.1
            result = canvas.toDataURL(mimeType, currentQuality)
            resultSize = Math.ceil(result.length * 0.75)
          }

          canvas.toBlob((blob) => {
            resolve({
              dataUrl: result,
              blob,
              width: w,
              height: h,
              originalSize,
              compressedSize: blob.size,
            })
          }, mimeType, currentQuality)
        } else {
          // PNG — just use scaled version
          const result = canvas.toDataURL(mimeType)
          canvas.toBlob((blob) => {
            resolve({
              dataUrl: result,
              blob,
              width: w,
              height: h,
              originalSize,
              compressedSize: blob.size,
            })
          }, mimeType)
        }
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Failed to load image for compression'))
    img.src = dataUrl
  })
}

function detectAlpha(ctx, w, h) {
  // Sample pixels to check for transparency (check corners and center)
  const points = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [Math.floor(w / 2), Math.floor(h / 2)],
  ]
  for (const [x, y] of points) {
    const pixel = ctx.getImageData(x, y, 1, 1).data
    if (pixel[3] < 255) return true
  }
  // Also do a quick scan of edges
  const topRow = ctx.getImageData(0, 0, w, 1).data
  for (let i = 3; i < topRow.length; i += 16) { // sample every 4th pixel
    if (topRow[i] < 255) return true
  }
  return false
}
