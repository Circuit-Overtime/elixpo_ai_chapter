// Upload images to Pollinations media storage and get a public URL
// Base URL: https://media.pollinations.ai
// Max file size: 10MB, files expire after 14 days

const MEDIA_BASE = 'https://media.pollinations.ai';

/**
 * Upload a base64 data URI or blob to Pollinations media storage
 * Returns the public URL for the uploaded file
 * @param {string} dataUri - base64 data URI (data:image/png;base64,...) or http URL
 * @param {string} [token] - API token for auth
 * @returns {Promise<string|null>} Public URL or null on failure
 */
export async function uploadToMedia(dataUri, token) {
  // If already a hosted URL, return as-is
  if (dataUri?.startsWith('http') && !dataUri.startsWith('data:')) return dataUri;

  if (!dataUri?.startsWith('data:')) return null;

  try {
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;

    const contentType = match[1];
    const base64Data = match[2];

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${MEDIA_BASE}/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: base64Data,
        contentType,
        name: `elixpo_${Date.now()}.${contentType.includes('png') ? 'png' : 'jpg'}`,
      }),
    });

    if (!res.ok) {
      console.error('[mediaUpload] Upload failed:', res.status);
      return null;
    }

    const data = await res.json();
    return data.url || null;
  } catch (err) {
    console.error('[mediaUpload] Error:', err.message);
    return null;
  }
}

/**
 * Convert any image source to a hosted Pollinations media URL
 * Handles: http URLs (pass-through), base64 data URIs (upload), blob URLs (convert then upload)
 */
export async function ensureHostedUrl(imageSrc, token) {
  if (!imageSrc) return null;

  // Already hosted
  if (imageSrc.startsWith('http') && !imageSrc.startsWith('data:')) return imageSrc;

  // Base64 — upload directly
  if (imageSrc.startsWith('data:')) return uploadToMedia(imageSrc, token);

  // Blob URL — convert to base64 first, then upload
  if (imageSrc.startsWith('blob:')) {
    const b64 = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = imageSrc;
    });
    if (!b64) return null;
    return uploadToMedia(b64, token);
  }

  return null;
}
