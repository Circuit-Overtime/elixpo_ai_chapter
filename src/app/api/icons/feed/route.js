export const runtime = 'edge'

import { NextResponse } from 'next/server'

let cachedData = null

async function getDataArray(origin) {
  if (cachedData) return cachedData

  const res = await fetch(`${origin}/icons/info/icons.json`)
  if (!res.ok) return []

  const metadata = await res.json()
  cachedData = Object.keys(metadata).map((filename) => ({
    filename,
    ...metadata[filename],
  }))
  return cachedData
}

export async function GET(request) {
  const url = new URL(request.url)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const limit = parseInt(url.searchParams.get('limit') || '5', 10)

  const dataArray = await getDataArray(url.origin)
  const paginated = dataArray.slice(offset, offset + limit)

  return NextResponse.json({
    offset,
    limit,
    total: dataArray.length,
    results: paginated,
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
