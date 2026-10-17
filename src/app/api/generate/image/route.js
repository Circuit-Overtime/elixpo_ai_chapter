import { NextResponse } from 'next/server';
import { POLLI_TOKEN, POLLI_BASE } from '../../pollinations';
import { getImageCost } from '../../../lib/credits';

export async function POST(request) {
  try {
    const body = await request.json();
    const { prompt, model = 'flux', width = 1024, height = 576, seed, style, imageUrl, imageUrls } = body;

    if (!prompt) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });

    const cost = getImageCost(model);

    const usedSeed = seed || Math.floor(Math.random() * 2147483647);

    // Build Pollinations request
    const polliBody = {
      prompt: style ? `${prompt}, ${style} style` : prompt,
      model,
      size: `${width}x${height}`,
      seed: usedSeed,
      response_format: 'b64_json',
      nologo: true,
      enhance: true,
      user: 'elixpoart',
    };

    // Add reference image if provided
    const refImage = imageUrl || (imageUrls && imageUrls[0]);
    if (refImage) polliBody.image = refImage;

    const headers = { 'Content-Type': 'application/json' };
    if (POLLI_TOKEN) headers['Authorization'] = `Bearer ${POLLI_TOKEN}`;

    const res = await fetch(`${POLLI_BASE}/v1/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(polliBody),
    });

    if (!res.ok) {
      let userMessage = 'Generation failed. Please try again.';
      if (res.status === 403) userMessage = 'This prompt was flagged by content moderation. Try rephrasing or using a different model.';
      else if (res.status === 429) userMessage = 'Too many requests. Please wait a moment and try again.';
      else if (res.status === 402) userMessage = 'Service quota exceeded. Please try again later.';
      else if (res.status >= 500) userMessage = 'The generation service is temporarily unavailable. Please try again.';
      return NextResponse.json({ error: userMessage, code: res.status }, { status: res.status });
    }

    const data = await res.json();
    const imageData = data.data?.[0]?.b64_json;
    const imageUrlResult = data.data?.[0]?.url;

    if (!imageData && !imageUrlResult) {
      return NextResponse.json({ error: 'No image data returned' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      imageData: imageData ? `data:image/png;base64,${imageData}` : null,
      imageUrl: imageUrlResult || null,
      seed: usedSeed,
      model,
      width,
      height,
      creditsCost: cost,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
