import { NextResponse } from 'next/server';
import { POLLI_TOKEN, POLLI_BASE } from '../pollinations';
import { ENHANCE_COST } from '../../lib/credits';

const SYSTEM_PROMPT = `Instruction Set for AI Image Prompt Engineering:
Your primary goal is to generate a high-quality, professional-grade image prompt under 1000 tokens. You will adhere to the following principles, derived from research into advanced prompt engineering.
**Core Formula:** Structure your prompt using this six-part formula:
**Subject + Action + Environment + Art Style + Lighting + Details**
- **Subject:** Be specific. Instead of "a woman," use "a young woman with freckles."
- **Action:** Add dynamism. "smiling thoughtfully and sitting on a beach."
- **Environment:** Provide context. "in a cozy cafe by the window."
- **Art Style:** Define the aesthetic. Specify camera types ("shot on a Canon 5D Mark IV"), lenses ("85mm portrait lens"), art movements ("in the style of Vincent van Gogh"), or use descriptive tags like "cyberpunk," "watercolor," "hyper-detailed," "4K masterpiece."
- **Lighting:** Set the mood. Be specific: "natural window light," "dramatic rim light," or "golden hour."
- **Details:** Add realism. "warm coffee cup in hands," "soft focus background."
**Image Input Processing:**
- If one or more images are provided, analyze them and generate a prompt describing a new scene incorporating the subjects or elements.
- When multiple images are provided, describe their relationship or a new composition.
**Advanced Techniques & General Rules:**
- **Editing:** Use clear action words like "add," "change," "make," "remove," or "replace."
- **Negative Prompts:** Exclude unwanted elements (e.g., "Negative Prompt: blurry, extra limbs, text").
- **Translation:** If the original prompt is not in English, translate it first.
- **Integration:** Do not omit details from the original prompt; integrate them into the enhanced prompt.
- **Style:** If no specific style is given, choose one that fits the subject matter.
- **Abstract Concepts:** Translate abstract ideas into visually descriptive prompts.
- **Final Output:** The final output must be **only the new prompt**, with no additional text or explanation.`;

export async function POST(request) {
  try {
    const { prompt } = await request.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    if (prompt.length > 2000) {
      return NextResponse.json({ error: 'Prompt too long (max 2000 chars)' }, { status: 400 });
    }

    const seed = Math.floor(Math.random() * 10000);
    const headers = { 'Content-Type': 'application/json' };
    if (POLLI_TOKEN) headers['Authorization'] = `Bearer ${POLLI_TOKEN}`;

    const res = await fetch(`${POLLI_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gemini-fast',
        seed,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        top_p: 0.9,
        temperature: 1.2,
        max_tokens: 500,
      }),
    });

    if (!res.ok) return NextResponse.json({ enhanced: prompt, original: prompt, fallback: true });

    const data = await res.json();
    const enhanced = data.choices?.[0]?.message?.content?.trim() || prompt;

    return NextResponse.json({ success: true, enhanced, original: prompt, creditsCost: ENHANCE_COST });
  } catch {
    return NextResponse.json({ enhanced: prompt, original: prompt, fallback: true });
  }
}
