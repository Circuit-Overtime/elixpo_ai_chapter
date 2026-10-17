import { NextResponse } from 'next/server';
import { POLLI_TOKEN, POLLI_BASE } from '../pollinations';

export async function POST(request) {
  try {
    const { image, query } = await request.json();
    if (!image || !query) {
      return NextResponse.json({ error: 'Image and query are required' }, { status: 400 });
    }

    const headers = { 'Content-Type': 'application/json' };
    if (POLLI_TOKEN) headers['Authorization'] = `Bearer ${POLLI_TOKEN}`;

    const res = await fetch(`${POLLI_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gemini-fast',
        messages: [
          {
            role: 'system',
            content: 'You are a precise image analysis assistant. Analyze images and reply ONLY with valid JSON. No markdown, no code blocks, no extra text.',
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: image } },
              { type: 'text', text: query },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[analyze] API error:', res.status, errText.slice(0, 300));
      return NextResponse.json({ hasCharacter: true, characters: [], reason: 'Analysis unavailable' });
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    console.log('[analyze] Raw response:', raw.slice(0, 500));

    // Try to parse JSON — may be wrapped in markdown code block
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json(parsed);
      } catch (e) {
        console.error('[analyze] JSON parse error:', e.message, 'from:', jsonMatch[0].slice(0, 200));
      }
    }

    // Fallback
    const lower = raw.toLowerCase();
    const hasCharacter = lower.includes('true') || lower.includes('yes') || lower.includes('character');
    return NextResponse.json({ hasCharacter, characters: [], reason: raw.slice(0, 200) });
  } catch (err) {
    console.error('[analyze] Error:', err.message);
    return NextResponse.json({ hasCharacter: true, characters: [], reason: 'Analysis failed' });
  }
}
