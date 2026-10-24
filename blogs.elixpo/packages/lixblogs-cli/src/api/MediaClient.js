import { randomUUID } from 'node:crypto';

const EXTENSION_BY_MIME = Object.freeze({
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
});

async function errorFrom(response) {
  const payload = await response.json().catch(() => ({}));
  const error = new Error(payload.error?.message || payload.error || `Media request failed with HTTP ${response.status}`);
  error.code = payload.error?.code || payload.code || `http_${response.status}`;
  error.status = response.status;
  return error;
}

export class MediaClient {
  constructor(authenticatedClient) { this.http = authenticatedClient; }

  async generate({ prompt, model = 'flux', seed, width, height, destination = 'inline', generationId = randomUUID(), reference }) {
    await this.http.requireScopes(['lixblogs:media:write']);
    let body;
    let headers;
    if (reference) {
      body = new FormData();
      for (const [key, value] of Object.entries({ prompt, model, seed, width, height, destination, generationId })) {
        if (value !== undefined) body.append(key, String(value));
      }
      body.append('referenceImage', new Blob([reference.bytes], { type: reference.mimeType }), reference.name || 'reference-image');
      headers = { accept: 'image/*, application/json' };
    } else {
      body = JSON.stringify({ prompt, model, seed, width, height, destination, generationId });
      headers = { 'content-type': 'application/json', accept: 'image/*, application/json' };
    }
    const response = await this.http.requestRaw('/api/v1/media/generate', {
      method: 'POST', headers, body,
    });
    if (!response.ok) throw await errorFrom(response);
    return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: response.headers.get('content-type') || 'image/jpeg', generationId };
  }

  async upload({ bytes, mimeType, blogId, mediaType = 'inline', uploadId = randomUUID() }) {
    await this.http.requireScopes(['lixblogs:media:write']);
    const form = new FormData();
    const extension = EXTENSION_BY_MIME[mimeType];
    if (!extension) throw new Error(`Unsupported image MIME type: ${mimeType}`);
    form.append('file', new Blob([bytes], { type: mimeType }), `lixblogs-${uploadId}.${extension}`);
    form.append('type', mediaType);
    form.append('uploadId', uploadId);
    if (blogId) form.append('blogId', blogId);
    const response = await this.http.requestRaw('/api/v1/media/upload', { method: 'POST', body: form, headers: { accept: 'application/json' } });
    if (!response.ok) throw await errorFrom(response);
    return response.json();
  }

  async delete(id) {
    if (!id) throw new Error('A media ID is required.');
    await this.http.requireScopes(['lixblogs:media:write']);
    const response = await this.http.request(`/api/v1/media/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw await errorFrom(response);
    const payload = await response.json();
    return payload.data || payload;
  }
}
