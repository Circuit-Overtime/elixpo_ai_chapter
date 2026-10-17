import { NextResponse } from 'next/server';
import { POLLI_TOKEN, POLLI_BASE } from '../pollinations';
import { DESCRIBE_COST } from '../../lib/credits';

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let base64Data;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      base64Data = body.image; // expect base64 data URL or raw base64
    } else {
      // Multipart form data
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || 'image/png';
      base64Data = `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

    if (!base64Data) return NextResponse.json({ error: 'No image data' }, { status: 400 });

    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POLLI_TOKEN}`,
     };


    const res = await fetch(`${POLLI_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'openai',
        messages: [
          {
            role: 'system',
            content: 'Describe this image in detail as an image generation prompt. Focus on subject, action, environment, art style, lighting, composition, colors, and mood. Output only the prompt text, no extra explanation.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image as a detailed prompt for image generation.' },
              { type: 'image_url', image_url: { url: base64Data } },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      console.error('Describe API error:', res.status);
      return NextResponse.json({ error: 'Vision service error', description: '' }, { status: 502 });
    }

    const data = await res.json();
    const description = data.choices?.[0]?.message?.content?.trim() || '';

    if (!description) {
      console.error('Describe returned empty. Response:', JSON.stringify(data).slice(0, 200));
      return NextResponse.json({ success: false, description: '', error: 'No description generated' });
    }

    return NextResponse.json({ success: true, description, creditsCost: DESCRIBE_COST });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to describe image: ' + err.message }, { status: 500 });
  }
}
