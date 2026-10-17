// Auto-prompt module
// Generates a video-optimized prompt from an image using vision AI
// Used when user clicks "Video" without typing a prompt

const API_BASE = '/api';

/**
 * Analyze an image and generate a video-optimized motion prompt
 * @param {string} imageSrc - Image source (base64 data URI)
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<string>} A video-ready prompt
 */
export async function generateVideoPrompt(imageSrc, signal) {
  if (!imageSrc) return fallbackPrompt();

  try {
    // Use the describe endpoint to get an image description
    const res = await fetch(`${API_BASE}/describe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageSrc }),
      signal,
    });

    if (!res.ok) return fallbackPrompt();

    const data = await res.json();
    const description = data.description || '';

    if (description.length > 10) {
      // Convert the static image description into a video prompt
      // Add motion and cinematic keywords
      return `${description}, subtle natural motion, gentle camera movement, cinematic atmosphere, smooth high quality video`;
    }

    return fallbackPrompt();
  } catch {
    return fallbackPrompt();
  }
}

function fallbackPrompt() {
  return 'subtle motion, gentle camera movement, cinematic atmosphere, smooth animation, high quality video';
}
