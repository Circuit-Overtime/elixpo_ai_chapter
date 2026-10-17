export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import {
  getPollinationsConnection,
  getPollinationsConnectionStatus,
} from '@/lib/pollinationsConnections'
import { POLLINATIONS_MODELS } from '@/lib/pollinationsOAuth'

const POLLINATIONS_GEN_URL = 'https://gen.pollinations.ai/v1/images/generations'

/**
 * Try to get Cloudflare D1 bindings. Returns null if unavailable (local dev).
 */
function tryGetDB() {
  try {
    const { DB } = getCloudflareBindings()
    return DB || null
  } catch {
    return null
  }
}

async function imageProviderError(response, generationProvider, operation) {
  const detail = await response.text().catch(() => '')
  console.error(`[AI Image] ${operation} failed:`, response.status, detail.slice(0, 500))
  if (generationProvider === 'personal_pollinations') {
    if (response.status === 401) {
      return NextResponse.json({ error: 'Your Pollinations authorization expired or was revoked. Reconnect it from Profile → Integrations.' }, { status: 401 })
    }
    if (response.status === 402) {
      return NextResponse.json({ error: 'Your Pollinations key has insufficient Pollen or has reached its approved budget.' }, { status: 402 })
    }
    if (response.status === 403) {
      return NextResponse.json({ error: 'This Pollinations key does not allow the selected image model. Reconnect to authorize Flux and Klein.' }, { status: 403 })
    }
  }
  return NextResponse.json({ error: `Image ${operation.toLowerCase()} failed. Try a different prompt or model.` }, { status: 502 })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const {
      prompt, model = 'flux', width = 768, height = 768,
      negative_prompt, seed,
      referenceImage,
    } = body

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const DB = tryGetDB()
    const authenticatedUser = await getAuthenticatedUser(request)
    if (!authenticatedUser) {
      return NextResponse.json({
        error: 'Sign in and connect Pollinations before generating images.',
        connectorRequired: true,
      }, { status: 401 })
    }
    if (referenceImage) {
      return NextResponse.json({ error: 'AI image editing is not available. Generate a new image instead.' }, { status: 400 })
    }
    if (!DB) {
      return NextResponse.json({ error: 'Pollinations connections are unavailable until the local database is configured.' }, { status: 503 })
    }

    if (!POLLINATIONS_MODELS.includes(model)) {
      return NextResponse.json({ error: 'Pollinations image generation supports Flux and Klein only.' }, { status: 400 })
    }

    const userId = authenticatedUser.id
    const connection = await getPollinationsConnection(DB, userId).catch((error) => {
      console.warn('[AI Image] Pollinations connection unavailable:', error?.message || error)
      return null
    })
    if (!connection) {
      const status = await getPollinationsConnectionStatus(DB, userId).catch(() => ({ connected: false }))
      const error = status.expired
        ? 'Your Pollinations authorization expired. Reconnect it from Profile → Integrations.'
        : status.connected
          ? 'Enable personal Pollen in Profile → Integrations before generating images.'
          : 'Connect Pollinations in Profile → Integrations before generating images.'
      return NextResponse.json({ error, connectorRequired: true, connectorStatus: status }, { status: 403 })
    }
    if (!connection.allowedModels.includes(model)) {
      return NextResponse.json({ error: 'Reconnect Pollinations to authorize Flux and Klein.' }, { status: 403 })
    }

    const apiKey = connection.accessToken
    const generationProvider = 'personal_pollinations'

    // --- Clamp dimensions ---
    const clampedW = Math.min(Math.max(width, 256), 1024)
    const clampedH = Math.min(Math.max(height, 256), 1024)
    const size = `${clampedW}x${clampedH}`

    console.log('[AI Image] Generating with personal Pollen:', { model, prompt: prompt.slice(0, 80), size })

    const genBody = {
      prompt: prompt.trim(),
      model,
      n: 1,
      size,
      response_format: 'b64_json',
      // Enhancement may invoke a text model. Keep this connector image-only.
      enhance: false,
    }
    if (negative_prompt) genBody.negative_prompt = negative_prompt
    if (seed !== undefined && seed !== -1) genBody.seed = seed

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)
    const res = await fetch(POLLINATIONS_GEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(genBody),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return imageProviderError(res, generationProvider, 'Generation')

    const data = await res.json()
    let dataUrl
    if (data.data?.[0]?.b64_json) {
      dataUrl = `data:image/png;base64,${data.data[0].b64_json}`
    } else if (data.data?.[0]?.url) {
      const imgRes = await fetch(data.data[0].url)
      const imgBuf = await imgRes.arrayBuffer()
      const base64 = btoa(new Uint8Array(imgBuf).reduce((d, b) => d + String.fromCharCode(b), ''))
      const contentType = imgRes.headers.get('content-type') || 'image/png'
      dataUrl = `data:${contentType};base64,${base64}`
    } else {
      return NextResponse.json({ error: 'Unexpected response from image API' }, { status: 502 })
    }

    // --- Record usage (skip if no DB) ---
    if (DB) {
      try {
        const id = crypto.randomUUID()
        await DB.prepare(
          `INSERT INTO ai_usage (id, user_id, guest_id, mode) VALUES (?, ?, ?, ?)`
        ).bind(id, userId, null, 'image-gen').run()
      } catch (e) {
        console.warn('[AI Image] Failed to record usage:', e.message)
      }
    }

    console.log('[AI Image] Success')

    return NextResponse.json({
      imageUrl: dataUrl,
      width: clampedW,
      height: clampedH,
      model,
      generationProvider,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[AI Image] Request timed out')
      return NextResponse.json({ error: 'Image generation timed out. Try a simpler prompt.' }, { status: 504 })
    }
    console.error('[AI Image] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Return whether this signed-in user can generate images with Pollinations.
 */
export async function GET(request) {
  try {
    const DB = tryGetDB()
    const authenticatedUser = await getAuthenticatedUser(request)
    if (!authenticatedUser) {
      return NextResponse.json({ error: 'Sign in to connect Pollinations.', connectorRequired: true }, { status: 401 })
    }
    if (!DB) {
      return NextResponse.json({ error: 'Pollinations connections are unavailable until the local database is configured.' }, { status: 503 })
    }
    const status = await getPollinationsConnectionStatus(DB, authenticatedUser.id)
    return NextResponse.json({
      ...status,
      ready: status.connected && status.usePersonalPollen && !status.expired,
      connectorRequired: true,
      models: [...POLLINATIONS_MODELS],
    })
  } catch (err) {
    console.error('[api/ai/image] Connector status error:', err)
    return NextResponse.json({ error: 'Failed to fetch Pollinations connector status' }, { status: 500 })
  }
}
