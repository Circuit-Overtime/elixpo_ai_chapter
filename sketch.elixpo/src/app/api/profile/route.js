import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'

export const runtime = 'edge'

const LIMITS = {
  displayName: 80,
  bio: 280,
  location: 100,
  timezone: 80,
  pronouns: 40,
  website: 300,
  company: 100,
  linkLabel: 30,
  linkUrl: 300,
  links: 6,
}
function cleanText(value, limit) {
  return String(value ?? '').trim().slice(0, limit)
}

function normalizeUrl(value, { optional = true } = {}) {
  const text = String(value ?? '').trim()
  if (!text && optional) return ''
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Unsupported protocol')
    return parsed.toString().slice(0, LIMITS.linkUrl)
  } catch {
    throw new Error('Enter a valid web address')
  }
}

function normalizeLinks(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, LIMITS.links).map((link) => ({
    label: cleanText(link?.label, LIMITS.linkLabel),
    url: normalizeUrl(link?.url),
  })).filter((link) => link.label && link.url)
}

function parseLinks(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function context(request) {
  const user = await getAuthenticatedUser(request)
  if (!user) return null
  return { user, DB: getCloudflareBindings().DB }
}

export async function GET(request) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const profile = await ctx.DB.prepare(`
    SELECT display_name, email, bio, location, timezone, pronouns,
           website, company, links
    FROM users WHERE id = ?
  `).bind(ctx.user.id).first()
  return NextResponse.json({
    displayName: profile?.display_name || ctx.user.displayName || '',
    email: profile?.email || ctx.user.email || '',
    bio: profile?.bio || '',
    location: profile?.location || '',
    timezone: profile?.timezone || '',
    pronouns: profile?.pronouns || '',
    website: profile?.website || '',
    company: profile?.company || '',
    links: parseLinks(profile?.links),
  })
}

export async function PATCH(request) {
  const ctx = await context(request)
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!ctx.user.email) return NextResponse.json({ error: 'Account email is unavailable' }, { status: 400 })
  try {
    const body = await request.json()
    const profile = {
      displayName: cleanText(body.displayName, LIMITS.displayName),
      bio: cleanText(body.bio, LIMITS.bio),
      location: cleanText(body.location, LIMITS.location),
      timezone: cleanText(body.timezone, LIMITS.timezone),
      pronouns: cleanText(body.pronouns, LIMITS.pronouns),
      website: normalizeUrl(body.website),
      company: cleanText(body.company, LIMITS.company),
      links: normalizeLinks(body.links),
    }
    if (!profile.displayName) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
    }

    await ctx.DB.prepare(`
      INSERT INTO users
        (id, email, display_name, provider, bio, location, timezone,
         pronouns, website, company, links, last_login_at, created_at)
      VALUES (?, ?, ?, 'elixpo', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        bio = excluded.bio,
        location = excluded.location,
        timezone = excluded.timezone,
        pronouns = excluded.pronouns,
        website = excluded.website,
        company = excluded.company,
        links = excluded.links
    `).bind(
      ctx.user.id,
      ctx.user.email,
      profile.displayName,
      profile.bio,
      profile.location,
      profile.timezone,
      profile.pronouns,
      profile.website,
      profile.company,
      JSON.stringify(profile.links),
    ).run()

    return NextResponse.json({ ...profile, email: ctx.user.email })
  } catch (error) {
    return NextResponse.json({ error: error?.message || 'Could not update profile' }, { status: 400 })
  }
}
