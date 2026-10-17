import { NextResponse } from 'next/server';
import { POLLI_TOKEN, POLLI_BASE } from '../../pollinations';
import { EDIT_COST } from '../../../lib/credits';

export async function POST(request) {
  try {
    const body = await request.json();
    const { prompt, imageUrl, model = 'gptimage', width = 1024, height = 576 } = body;

    if (!prompt) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    if (!imageUrl) return NextResponse.json({ error: 'Image URL is required for editing' }, { status: 400 });

    const headers = {};
    if (POLLI_TOKEN) headers['Authorization'] = `Bearer ${POLLI_TOKEN}`;

    let res;

    // If imageUrl is a base64 data URI, send as multipart form data
    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return NextResponse.json({ error: 'Invalid base64 image data' }, { status: 400 });

      const mimeType = match[1];
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');
      const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';

      const formData = new FormData();
      formData.append('image', new Blob([buffer], { type: mimeType }), `image.${ext}`);
      formData.append('prompt', prompt);
      formData.append('model', model);
      formData.append('size', `${width}x${height}`);
      formData.append('response_format', 'b64_json');
      formData.append('nologo', 'true');

      res = await fetch(`${POLLI_BASE}/v1/images/edits`, {
        method: 'POST',
        headers,
        body: formData,
      });
    } else {
      // Regular URL — send as JSON
      headers['Content-Type'] = 'application/json';
      res = await fetch(`${POLLI_BASE}/v1/images/edits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          model,
          image: imageUrl,
          size: `${width}x${height}`,
          response_format: 'b64_json',
          nologo: true,
          user: 'elixpoart',
        }),
      });
    }

    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch {}
      console.error('[edit] API error:', res.status, detail);
      let userMessage = 'Edit failed. Please try again.';
      if (res.status === 403) userMessage = 'This edit was flagged by content moderation. Try rephrasing your description.';
      else if (res.status === 429) userMessage = 'Too many requests. Please wait a moment.';
      else if (res.status >= 500) userMessage = 'The editing service is temporarily unavailable.';
      return NextResponse.json({ error: userMessage, code: res.status }, { status: res.status });
    }

    const data = await res.json();
    const imageData = data.data?.[0]?.b64_json;
    const resultUrl = data.data?.[0]?.url;

    if (!imageData && !resultUrl) {
      return NextResponse.json({ error: 'No image data returned' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      imageData: imageData ? `data:image/png;base64,${imageData}` : null,
      imageUrl: resultUrl || null,
      model,
      creditsCost: EDIT_COST,
    });
  } catch (err) {
    console.error('[edit] Error:', err.message);
    return NextResponse.json({ error: err.message || 'Edit failed' }, { status: 500 });
  }
}
