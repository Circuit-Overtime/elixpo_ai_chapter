export const runtime = 'edge'

import { NextResponse } from 'next/server'

let dataArray = null
const svgCache = new Map()

async function loadData(origin) {
  if (dataArray) return

  const res = await fetch(`${origin}/icons/info/icons.json`)
  if (!res.ok) return

  const metadata = await res.json()
  dataArray = Object.keys(metadata).map((filename) => {
    const item = metadata[filename]
    const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ') : (item.keywords || '')
    return {
      filename,
      ...item,
      normalizedCategory: String(item.category || '').toLowerCase(),
      searchText: `${filename.replace(/[_-]/g, ' ')} ${keywords} ${item.description || ''} ${item.category || ''}`.toLowerCase(),
    }
  })
}

async function fetchSvg(origin, filename) {
  if (svgCache.has(filename)) return svgCache.get(filename)
  try {
    const svgRes = await fetch(`${origin}/icons/${filename}`)
    const svg = svgRes.ok ? await svgRes.text() : null
    if (svg) svgCache.set(filename, svg)
    return svg
  } catch {
    return null
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  const origin = url.origin
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const category = (url.searchParams.get('category') || '').trim().toLowerCase()
  const inline = url.searchParams.get('inline') === '1'

  await loadData(origin)
  if (!dataArray) return NextResponse.json({ results: [] })

  // One bounded pass over the metadata. Avoid fuzzy indexes, result sorting,
  // and multiple filter passes so every query is O(N) and can return as soon
  // as the 60 visible results are found.
  const terms = q ? q.split(/\s+/).filter(Boolean) : []
  const results = []
  for (const item of dataArray) {
    if (category && item.normalizedCategory !== category) continue
    if (terms.length && !terms.every((term) => item.searchText.includes(term))) continue
    const { searchText, normalizedCategory, ...publicItem } = item
    results.push(publicItem)
    if (results.length === 60) break
  }

  // CORS — the icons API is intentionally public so any client (the
  // npm package, third-party embeds, etc.) can search and load icons
  // without holding a sketch.elixpo session.
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (inline) {
    const withSvg = await Promise.all(
      results.map(async (item) => {
        const svg = await fetchSvg(origin, item.filename)
        return { ...item, svg }
      })
    )
    return NextResponse.json({ results: withSvg }, {
      headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    })
  }

  return NextResponse.json({ results }, {
    headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
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
