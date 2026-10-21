import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const response = await fetch('https://api.github.com/repos/elixpo/crumb.elixpo', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'crumb.elixpo' },
      next: { revalidate: 3600 },
    })
    if (!response.ok) throw new Error('GitHub request failed')
    const repository = await response.json() as { stargazers_count?: number }
    return NextResponse.json({ stars: repository.stargazers_count ?? 0 }, { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { 'cache-control': 'public, max-age=60' } })
  }
}
