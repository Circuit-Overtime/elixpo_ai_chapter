// Video generation module
// Handles video creation via the /api/generate/video endpoint

import { ensureHostedUrl } from './mediaUpload';

const API_BASE = '/api';

const VIDEO_MODELS = [
  { id: 'ltx-2', label: 'LTX-2.3', desc: 'Fast text-to-video with upscaler', maxDuration: 10 },
];

const DEFAULT_MODEL = 'ltx-2';

/**
 * Generate a video from a text prompt
 * @param {Object} options
 * @param {string} options.prompt - Text description of the video
 * @param {string} [options.model='ltx-2'] - Video model to use
 * @param {number} [options.width=1024] - Width in pixels
 * @param {number} [options.height=576] - Height in pixels
 * @param {number} [options.duration=5] - Duration in seconds
 * @param {string} [options.imageUrl] - Reference image (any format: base64, blob, http)
 * @param {AbortSignal} [options.signal] - AbortController signal
 * @returns {Promise<{success: boolean, videoData?: string, error?: string}>}
 */
export async function generateVideo({
  prompt,
  model = DEFAULT_MODEL,
  width = 1024,
  height = 576,
  duration = 5,
  imageUrl = null,
  signal = null,
}) {
  if (!prompt?.trim()) {
    return { success: false, error: 'Prompt is required' };
  }

  try {
    // Upload reference image to media storage to avoid URI too long
    let hostedImageUrl = null;
    if (imageUrl) {
      const token = typeof window !== 'undefined'
        ? process.env.NEXT_PUBLIC_POLLINATIONS_API_IMAGE
        : null;
      hostedImageUrl = await ensureHostedUrl(imageUrl, token);
    }

    const res = await fetch(`${API_BASE}/generate/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt.trim(),
        model,
        width,
        height,
        duration,
        imageUrl: hostedImageUrl,
      }),
      signal,
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Video generation failed' };
    }

    return {
      success: true,
      videoData: data.videoData,
      model: data.model,
      duration: data.duration,
      creditsCost: data.creditsCost,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Cancelled' };
    }
    return { success: false, error: err.message || 'Video generation failed' };
  }
}

/**
 * Prepare an image for video generation — uploads to media storage
 * @deprecated Use generateVideo directly, it handles upload internally
 */
export async function prepareImageForVideo(imageSrc) {
  const token = typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_POLLINATIONS_API_IMAGE
    : null;
  return ensureHostedUrl(imageSrc, token);
}

export { VIDEO_MODELS, DEFAULT_MODEL };
