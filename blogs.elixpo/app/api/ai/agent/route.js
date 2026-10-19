export const runtime = 'edge';
// Non-streaming AI endpoint via lixsearch

import { enforceAILimits } from '../../../../lib/aiRateLimit';

const LIXSEARCH_BASE = 'https://search.elixpo.com';

export async function POST(request) {
  const { error } = await enforceAILimits();
  if (error) return error;

  const body = await request.json();
  const { sessionId, query } = body;

  if (!sessionId || !query) {
    return new Response(JSON.stringify({ error: 'Missing sessionId or query' }), { status: 400 });
  }

  const apiKey = process.env.ELIXPO_SEARCH_API_KEY || '';

  try {
    const aiRes = await fetch(`${LIXSEARCH_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        query,
        stream: false,
        session_id: sessionId,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return new Response(JSON.stringify({ error: `LixSearch error: ${err}` }), { status: aiRes.status });
    }

    const data = await aiRes.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'AI request failed' }), { status: 500 });
  }
}
