// Client-side AI module — lixsearch session-based streaming
// Uses search.elixpo.com/api/search?query=...&stream=true&session_id=... via /api/ai/stream proxy

// ── Session management ──

/**
 * Get or create a lixsearch session for a blog.
 * Returns the session ID string.
 *
 * @param {string} slugid - Blog slug ID
 * @returns {Promise<string>} sessionId
 */
export function getOrCreateSession(blogId) {
  // Session ID is deterministic: blog_<blogId>
  // search.elixpo.com auto-creates sessions on first use
  return `blog_${blogId}`;
}

// ── TASK status parsing ──

const TASK_REGEX = /<TASK>(.*?)<\/TASK>/;

function parseTask(content) {
  const match = content.match(TASK_REGEX);
  return match ? match[1] : null;
}

function taskToPhase(taskText) {
  const t = taskText.toLowerCase();
  if (t === 'done') return 'done';
  if (t.includes('generating image') || t.includes('creating your image') || t.includes('image generation in progress')) return 'generating_image';
  if (t.includes('image generated') || t.includes('image ready') || t.includes('image created')) return 'image_ready';
  if (t.includes('searching') || t.includes('looking things up') || t.includes('finding relevant')) return 'searching';
  if (t.includes('thinking') || t.includes('analyzing') || t.includes('understanding')) return 'thinking';
  if (t.includes('preparing') || t.includes('synthesizing') || t.includes('putting it all together')) return 'preparing';
  if (t.includes('finalizing') || t.includes('wrapping up') || t.includes('almost there')) return 'finalizing';
  return 'thinking';
}

// ── Image URL extraction from markdown ──

const IMAGE_MD_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

function extractImages(text) {
  const images = [];
  let match;
  while ((match = IMAGE_MD_REGEX.exec(text)) !== null) {
    images.push({ alt: match[1], url: match[2], fullMatch: match[0] });
  }
  IMAGE_MD_REGEX.lastIndex = 0;
  return images;
}

// ── Image re-upload (lixsearch URL → Cloudinary for persistence) ──

/**
 * Download an image from a temporary URL, compress it, and upload to Cloudinary.
 * Returns the permanent Cloudinary URL, or null on failure.
 */
export async function reuploadImage(srcUrl, alt) {
  try {
    const imgRes = await fetch(srcUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
    const blob = await imgRes.blob();

    const { compressBlogImage } = await import('../utils/compressImage');
    const compressed = await compressBlogImage(blob);

    const formData = new FormData();
    formData.append('file', compressed.blob, `ai_${Date.now()}.webp`);
    formData.append('type', 'image');

    const uploadRes = await fetch('/api/media/upload', { method: 'POST', body: formData });
    if (!uploadRes.ok) throw new Error('Upload failed');

    const data = await uploadRes.json();
    return { url: data.url, id: data.id || '' };
  } catch (err) {
    console.error('Image re-upload failed:', err);
    return null;
  }
}

// ── Main streaming function ──

/**
 * Stream AI response from lixsearch via SSE.
 * Sends a single query string (system prompt + user prompt combined) to the search API.
 *
 * @param {Object} opts
 * @param {string} opts.sessionId - lixsearch session ID
 * @param {string} opts.systemPrompt - System prompt (prepended to query)
 * @param {string} opts.userPrompt - User message
 * @param {Function} [opts.onTask] - Called with (taskText, phase) on INFO events
 * @param {Function} [opts.onChunk] - Called with (newText, fullText) on RESPONSE chunks
 * @param {Function} [opts.onImage] - Called with ({ alt, url }) when an image URL appears
 * @param {Function} [opts.onDone] - Called with (fullText) when stream completes
 * @param {Function} [opts.onError] - Called with (error) on failure
 * @param {AbortSignal} [opts.signal] - Abort signal
 * @returns {Promise<string>} Full response text
 */
export async function streamAI({ sessionId, systemPrompt, userPrompt, onTask, onChunk, onImage, onDone, onError, signal }) {
  let fullText = '';
  let knownImages = new Set();

  // Combine system prompt and user prompt into a single query
  const query = systemPrompt
    ? `[System: ${systemPrompt}]\n\n${userPrompt}`
    : userPrompt;

  try {
    const res = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, query }),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onDone?.(fullText);
          return fullText;
        }

        try {
          const parsed = JSON.parse(data);
          const eventType = parsed.event_type;
          const content = parsed.choices?.[0]?.delta?.content;
          const finishReason = parsed.choices?.[0]?.finish_reason;

          if (!content) continue;

          if (eventType === 'INFO') {
            const task = parseTask(content);
            if (task) {
              const phase = taskToPhase(task);
              onTask?.(task, phase);
              if (phase === 'done') {
                onDone?.(fullText);
                return fullText;
              }
            }
          } else if (eventType === 'RESPONSE') {
            fullText += content;
            onChunk?.(content, fullText);

            // Detect new image URLs in the stream
            if (onImage) {
              const images = extractImages(fullText);
              for (const img of images) {
                if (!knownImages.has(img.url)) {
                  knownImages.add(img.url);
                  onImage(img);
                }
              }
            }
          }

          if (finishReason === 'stop') {
            onDone?.(fullText);
            return fullText;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    onDone?.(fullText);
    return fullText;
  } catch (err) {
    if (err.name === 'AbortError') return fullText;
    onError?.(err);
    throw err;
  }
}
