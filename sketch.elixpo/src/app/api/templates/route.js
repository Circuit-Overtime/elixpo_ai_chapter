import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getAuthenticatedUser } from '@/lib/serverAuth'
import {
  normalizeTemplateDescription,
  normalizeTemplateTags,
  normalizeTemplateTitle,
  serializeTemplate,
  templateSlug,
  TEMPLATE_COVER_MAX_BYTES,
  TEMPLATE_DOC_MAX_BYTES,
  TEMPLATE_SCENE_MAX_BYTES,
} from '@/lib/workspaceTemplates'

export const runtime = 'edge'

const SELECT_TEMPLATE = `
  SELECT t.*, u.display_name AS publisher_name, u.avatar AS publisher_avatar
  FROM workspace_templates t
  LEFT JOIN users u ON u.id = t.publisher_user_id`

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings()
    const url = new URL(request.url)
    const mine = url.searchParams.get('mine') === '1'
    const viewer = mine ? await getAuthenticatedUser(request) : null
    if (mine && !viewer) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const query = String(url.searchParams.get('q') || '').trim().slice(0, 80)
    const tag = String(url.searchParams.get('tag') || '').trim().toLowerCase().slice(0, 24)
    const limit = Math.min(48, Math.max(1, Number(url.searchParams.get('limit')) || 24))
    const clauses = mine ? ['t.publisher_user_id = ?'] : [`t.status = 'published'`]
    const bindings = []
    if (mine) bindings.push(viewer.id)
    if (query) {
      clauses.push('(t.title LIKE ? OR t.description LIKE ? OR t.tags_json LIKE ?)')
      const like = `%${query}%`
      bindings.push(like, like, like)
    }
    if (tag) {
      clauses.push('t.tags_json LIKE ?')
      bindings.push(`%"${tag}"%`)
    }
    bindings.push(limit)
    const rows = await DB.prepare(`${SELECT_TEMPLATE}
      WHERE ${clauses.join(' AND ')}
      ORDER BY t.published_at DESC LIMIT ?`).bind(...bindings).all()
    return NextResponse.json({ templates: (rows.results || []).map((row) => serializeTemplate(row, { includeCover: !mine })) })
  } catch (error) {
    console.error('[api/templates] list failed:', error)
    return NextResponse.json({ error: 'Could not load templates' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: 'Sign in to publish a workspace' }, { status: 401 })
    const { DB } = getCloudflareBindings()
    const body = await request.json()
    const title = normalizeTemplateTitle(body.title)
    const description = normalizeTemplateDescription(body.description)
    const tags = normalizeTemplateTags(body.tags)
    if (!title) return NextResponse.json({ error: 'A template title is required' }, { status: 400 })
    if (!body.encryptedData || !body.publicKey) {
      return NextResponse.json({ error: 'The public workspace snapshot is missing' }, { status: 400 })
    }
    if (typeof body.publicKey !== 'string' || body.publicKey.length < 32 || body.publicKey.length > 128) {
      return NextResponse.json({ error: 'The public snapshot key is invalid' }, { status: 400 })
    }
    if (new Blob([body.encryptedData]).size > TEMPLATE_SCENE_MAX_BYTES ||
        (body.encryptedDocData && new Blob([body.encryptedDocData]).size > TEMPLATE_DOC_MAX_BYTES)) {
      return NextResponse.json({ error: 'The workspace snapshot is too large to publish' }, { status: 413 })
    }
    const cover = typeof body.coverDataUrl === 'string' && body.coverDataUrl.startsWith('data:image/')
      ? body.coverDataUrl
      : null
    if (cover && new Blob([cover]).size > TEMPLATE_COVER_MAX_BYTES) {
      return NextResponse.json({ error: 'Template cover must be smaller than 200 KB' }, { status: 413 })
    }
    if (body.sourceSessionId) {
      const existing = await DB.prepare("SELECT slug FROM workspace_templates WHERE source_session_id = ? AND status = 'published'").bind(body.sourceSessionId).first()
      if (existing) {
        return NextResponse.json({ error: 'This workspace is already published. Use PATCH to update it.' }, { status: 409 })
      }
    }
    const id = crypto.randomUUID()
    let slug = templateSlug(title)
    const collision = await DB.prepare('SELECT id FROM workspace_templates WHERE slug = ?').bind(slug).first()
    if (collision) slug = templateSlug(title, id.slice(0, 6))
    await DB.prepare(`INSERT INTO workspace_templates
      (id, slug, publisher_user_id, source_session_id, title, description, tags_json,
       cover_data_url, encrypted_data, public_key, encrypted_doc_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, slug, user.id, body.sourceSessionId || null, title, description,
        JSON.stringify(tags), cover, body.encryptedData, body.publicKey, body.encryptedDocData || null)
      .run()
    return NextResponse.json({ id, slug, url: `/templates/${slug}` }, { status: 201 })
  } catch (error) {
    console.error('[api/templates] publish failed:', error)
    return NextResponse.json({ error: 'Could not publish workspace' }, { status: 500 })
  }
}
