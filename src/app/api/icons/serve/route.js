export const runtime = 'edge'

import { NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const name = (searchParams.get('name') || '').trim()

  if (!name || !name.endsWith('.svg')) {
    return NextResponse.json(
      { error: 'Invalid or missing SVG filename.' },
      { status: 400, headers: CORS }
    )
  }

  // Prevent path traversal
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '')
  const origin = new URL(request.url).origin

  try {
    const res = await fetch(`${origin}/icons/${safeName}`)
    if (!res.ok) {
      return NextResponse.json({ error: 'SVG file not found.' }, { status: 404, headers: CORS })
    }
    const svg = await res.text()
    return new NextResponse(svg, {
      headers: {
        ...CORS,
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'SVG file not found.' }, { status: 404, headers: CORS })
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } })
}
